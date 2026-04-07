import discord
from discord.ext import commands
import fitz  # PyMuPDF - used for parsing PDF content
import logging
import json
import time
import os
from discord import app_commands
from discord.ext import tasks
from discord.ui import Button, View

# RAG & Auto-Update Imports
from scripts.core.rag_engine import RAGEngine
from scripts.core.parser import DiscordMessage, create_user_mapping
from scripts.core.anonymizer import RuleAnonymizer
from scripts.core.extractor import RulingExtractor
from scripts.utils.data_loader import get_protective_shield, get_official_judges

# ---------------------------
# Configure logging to console
# ---------------------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------------------
# Discord Bot Setup
# ---------------------------
# Enables message content tracking and registers command prefix (!)
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

# Initialize RAG Engine globally
try:
    rag_engine = RAGEngine()
except Exception as e:
    logger.error(f"Failed to initialize RAGEngine: {e}")
    rag_engine = None

# ---------------------------
# Auto-Sync Background Task
# ---------------------------
SYNC_STATE_FILE = "data/sync_state.json"

def get_last_synced_id():
    if os.path.exists(SYNC_STATE_FILE):
        with open(SYNC_STATE_FILE, "r") as f:
            data = json.load(f)
            return data.get("last_message_id")
    return None

def set_last_synced_id(msg_id):
    os.makedirs(os.path.dirname(SYNC_STATE_FILE), exist_ok=True)
    with open(SYNC_STATE_FILE, "w") as f:
        json.dump({"last_message_id": msg_id}, f)

@tasks.loop(hours=24)
async def auto_sync_rulings():
    channel_id = os.getenv("RULING_CHANNEL_ID")
    if not channel_id or not rag_engine:
        return
        
    try:
        channel = bot.get_channel(int(channel_id))
        if not channel:
            return
            
        last_id = get_last_synced_id()
        after = discord.Object(id=last_id) if last_id else None
        
        new_messages = []
        highest_id = last_id
        
        logger.info("Auto-Sync: Fetching new messages...")
        async for msg in channel.history(limit=1000, after=after, oldest_first=True):
            new_messages.append(msg)
            highest_id = msg.id
            
        if not new_messages:
            logger.info("Auto-Sync: No new messages found.")
            return
            
        # Convert to DiscordMessage format
        parsed_msgs = []
        for dmsg in new_messages:
            if not dmsg.content:
                continue
            time_str = dmsg.created_at.strftime("%d.%m.%Y %H:%M")
            author_name = dmsg.author.display_name
            parsed = DiscordMessage(time_str, author_name, dmsg.content)
            parsed_msgs.append(parsed)
            
        if not parsed_msgs:
            return
            
        shield = get_protective_shield("ragdata/carddata.json")
        judges = get_official_judges()
        
        user_map = create_user_mapping(parsed_msgs, judges, shield)
        anonymizer = RuleAnonymizer(user_map, shield)
        
        for msg in parsed_msgs:
            msg.author = user_map.get(msg.author, "UNKNOWN_USER")
            msg.content = anonymizer.anonymize_text(msg.content)
            
        extractor = RulingExtractor(parsed_msgs)
        qa_pairs = extractor.cluster_messages()
        
        if qa_pairs:
            rulings_file = "ragdata/processed_rulings_final.json"
            existing_rulings = []
            if os.path.exists(rulings_file):
                with open(rulings_file, "r", encoding="utf-8") as f:
                    try:
                        existing_rulings = json.load(f)
                    except json.JSONDecodeError:
                        existing_rulings = []
            
            for index, pair in enumerate(qa_pairs):
                # Unique ID
                source_id = f"auto_{highest_id}_{index}"
                is_judge = len(pair.get("judges", [])) > 0
                
                success = rag_engine.upsert_ruling(
                    question=pair["question"],
                    answer=pair["answer"],
                    author=pair["question_author"],
                    date=pair["date"],
                    is_judge=is_judge,
                    source_id=source_id
                )
                if success:
                    existing_rulings.append(pair)
            
            with open(rulings_file, "w", encoding="utf-8") as f:
                json.dump(existing_rulings, f, indent=4)
                
        set_last_synced_id(highest_id)
        logger.info(f"Auto-Sync complete: Processed {len(new_messages)} messages, found {len(qa_pairs)} QA pairs.")
    except Exception as e:
        logger.error(f"Auto-Sync error: {e}")

@auto_sync_rulings.before_loop
async def before_auto_sync():
    await bot.wait_until_ready()

# ---------------------------
# PDF Document Paths
# ---------------------------
# Maps logical document identifiers (used in commands) to actual PDF file paths
pdfs = {
    "REG": "data/REG.pdf",
    "ORDIR": "data/ORDIR.pdf"
}

# ---------------------------
# In-memory storage for section titles by document
# Populated at bot startup to support autocomplete
# ---------------------------
section_titles_by_doc = {}

# ---------------------------
# Utility class for paginating long text
# Used to split long sections into manageable Discord embed pages
# ---------------------------
class PaginatedText:
    def __init__(self, text, per_page=1000):
        self.text = text
        self.per_page = per_page
        self.pages = [text[i:i + per_page] for i in range(0, len(text), per_page)]
        self.total_pages = len(self.pages)

# ---------------------------
# Function to extract all section headings from a PDF
# Triggered once at startup per document to support autocomplete
# Uses two phases: main content and glossary based on heading triggers
# ---------------------------
def extract_sections(pdf_path, heading_size1, heading_size2, heading_font):
    try:
        doc = fitz.open(pdf_path)
        extracted_titles = set()
        tracking = False
        use_heading_size2 = False

        for page in doc:
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                for line in block.get("lines", []):
                    line_text = ""
                    line_font = None
                    line_size = None

                    for span in line.get("spans", []):
                        text = span["text"].strip()
                        font_size = round(span["size"])
                        font_name = span["font"]

                        if line_text:
                            line_text += " "
                        line_text += text

                        if line_font is None:
                            line_font = font_name
                            line_size = font_size
                        elif line_font != font_name or line_size != font_size:
                            line_font = None

                    # Trigger extraction phase after "Special Ability Structure"
                    if line_text == "Special Ability Structure" and font_size == 36 and "Arial" in font_name:
                        tracking = True
                        use_heading_size2 = False

                    # Switch to glossary mode after "Glossary of Terms"
                    if line_text == "Glossary of Terms" and font_size == 36 and "Arial" in font_name:
                        use_heading_size2 = True
                        tracking = True
                        continue

                    # Capture headings based on the current mode (main or glossary)
                    if tracking:
                        font_matches = heading_font.lower() in (line_font or "").lower()
                        if not use_heading_size2:
                            if font_size == heading_size1 and font_matches:
                                extracted_titles.add(line_text)
                        else:
                            if font_size == heading_size2 and font_matches:
                                extracted_titles.add(line_text)

        valid_titles = [title for title in extracted_titles if 1 <= len(title) <= 100]
        return sorted(valid_titles)

    except Exception as e:
        logger.error(f"Error extracting sections: {str(e)}")
        return []

# ---------------------------
# Function to extract a specific section's content from a PDF
# Invoked at runtime when user requests a section
# Identifies section body between two headings and formats bullets/headings
# ---------------------------
def extract_section_with_specific_format(pdf_path, main_heading, heading_size1, heading_size2, heading_font):
    try:
        doc = fitz.open(pdf_path)

        # Internal helper to find and parse the section body
        def process_section(heading_size):
            found_main_heading = False
            section_text = []
            current_bullet_text = None

            for page_num, page in enumerate(doc, start=1):
                blocks = page.get_text("dict")["blocks"]
                for block in blocks:
                    for line in block.get("lines", []):
                        line_text = ""
                        for span in line.get("spans", []):
                            text = span["text"].strip()
                            font_size = span["size"]
                            font_name = span["font"]
                            rounded_font_size = round(font_size)

                            # Match the requested section heading
                            if text == main_heading and rounded_font_size == heading_size and heading_font in font_name:
                                found_main_heading = True
                                section_text.append(text)
                                continue

                            # End the section if a new heading is found
                            if found_main_heading and rounded_font_size == heading_size and heading_font in font_name:
                                return "\n".join(section_text)

                            if found_main_heading:
                                # Handle common bullet point symbols
                                if text in ['•', '○', '●', '-', '▪']:
                                    current_bullet_text = '-'
                                    continue

                                # Apply formatting for subsection headers
                                if rounded_font_size == 14:
                                    text = f"**{text}**"

                                # Format bullet line
                                if current_bullet_text:
                                    if text:
                                        combined_text = f"{current_bullet_text} {text}"
                                        line_text += combined_text + " "
                                        current_bullet_text = None
                                else:
                                    line_text += text + " "

                        if line_text:
                            section_text.append(line_text.strip())

            return "\n".join(section_text) if section_text else None

        # Try extracting section from main content, then glossary
        section_text = process_section(heading_size1)
        if section_text:
            return section_text, False

        section_text = process_section(heading_size2)
        if section_text:
            return section_text, True

        return None, False

    except Exception as e:
        logger.error(f"Error processing PDF: {str(e)}")
        return None, False

# ---------------------------
# Bot ready event
# Triggered once after bot login
# Logs bot status, syncs slash commands, and extracts section headings for autocomplete
# ---------------------------
@bot.event
async def on_ready():
    global section_titles_by_doc
    logger.info(f'Bot is ready as {bot.user}')

    permissions = discord.Permissions(send_messages=True, embed_links=True, attach_files=True, use_application_commands=True)
    invite_link = discord.utils.oauth_url(bot.user.id, permissions=permissions)
    logger.info(f'Invite link: {invite_link}')

    # Load section headings from each document and store them
    for doc_key, path in pdfs.items():
        titles = extract_sections(path, heading_size1=30, heading_size2=14, heading_font="Arial")
        section_titles_by_doc[doc_key] = titles
        logger.info(f"{doc_key}: Extracted {len(titles)} section titles")

    # Register slash commands with Discord
    await bot.tree.sync()
    
    # Start auto-sync background task 
    if not auto_sync_rulings.is_running():
        auto_sync_rulings.start()

# ---------------------------
# Autocomplete handler for /lookup command
# Suggests matching section titles based on user input
# ---------------------------
async def section_autocomplete(interaction: discord.Interaction, current: str):
    choices = []
    for doc_key, titles in section_titles_by_doc.items():
        filtered = [title for title in titles if current.lower() in title.lower()][:5]
        choices.extend([app_commands.Choice(name=f"{doc_key} > {title}", value=f"{doc_key}|{title}") for title in filtered])
    return choices[:25]

# ---------------------------
# Persistent pagination file for remembering user state
# ---------------------------
PROGRESS_FILE = "pagination_progress.json"

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    return {}

def save_progress(data):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(data, f, indent=4)

user_progress = load_progress()

# ---------------------------
# View class for pagination buttons in embeds
# Allows user to scroll left/right through long section content
# ---------------------------
class PersistentPagination(View):
    def __init__(self, paginated, embed, message, user_id, query):
        super().__init__(timeout=None)
        self.paginated = paginated
        self.embed = embed
        self.message = message
        self.user_id = str(user_id)

        query_hash = hash(query)
        self.progress_key = f"{self.user_id}_{query_hash}_{int(time.time() * 1000)}"
        self.current_page = 0

        self.prev_button = Button(label="◀️", style=discord.ButtonStyle.primary)
        self.next_button = Button(label="▶️", style=discord.ButtonStyle.primary)
        self.prev_button.callback = self.prev_callback
        self.next_button.callback = self.next_callback

        self.add_item(self.prev_button)
        self.add_item(self.next_button)

        user_progress[self.progress_key] = self.current_page
        save_progress(user_progress)
        self.update_embed_and_buttons()

    async def prev_callback(self, interaction: discord.Interaction):
        if self.current_page > 0:
            self.current_page -= 1
            self.update_embed_and_buttons()
            user_progress[self.progress_key] = self.current_page
            save_progress(user_progress)
            await interaction.response.edit_message(embed=self.embed, view=self)

    async def next_callback(self, interaction: discord.Interaction):
        if self.current_page < self.paginated.total_pages - 1:
            self.current_page += 1
            self.update_embed_and_buttons()
            user_progress[self.progress_key] = self.current_page
            save_progress(user_progress)
            await interaction.response.edit_message(embed=self.embed, view=self)

    def update_embed_and_buttons(self):
        self.embed.description = self.paginated.pages[self.current_page]
        self.embed.set_footer(text=f"Page {self.current_page + 1}/{self.paginated.total_pages}")
        self.prev_button.disabled = self.current_page == 0
        self.next_button.disabled = self.current_page == self.paginated.total_pages - 1

# ---------------------------
# Slash command: /lookup
# Allows user to select a document section and view its content with pagination
# Section choices are populated via autocomplete based on document index
# ---------------------------
@bot.tree.command(name="lookup", description="Lookup a section from a specific document")
@app_commands.describe(section="Type to select a document and section")
@app_commands.autocomplete(section=section_autocomplete)
async def lookup(interaction: discord.Interaction, section: str):
    await interaction.response.defer(thinking=True)

    try:
        doc_key, section_title = section.split("|", 1)
        pdf_path = pdfs.get(doc_key)
        if not pdf_path:
            await interaction.followup.send("Invalid document selected.", ephemeral=True)
            return

        section_text, is_glossary_result = extract_section_with_specific_format(
            pdf_path, section_title, heading_size1=30, heading_size2=14, heading_font="Arial"
        )

        if not section_text:
            await interaction.followup.send(f"'{section_title}' not found in {doc_key}.", ephemeral=True)
            return

        paginated = PaginatedText(section_text)
        embed = discord.Embed(
            title=f"{doc_key} - {'Glossary' if is_glossary_result else 'Section'}: {section_title}",
            color=discord.Color.green() if is_glossary_result else discord.Color.blue()
        )
        embed.description = paginated.pages[0]
        embed.set_footer(text=f"Page 1/{paginated.total_pages}")

        message = await interaction.followup.send(embed=embed, ephemeral=False)
        if paginated.total_pages > 1:
            view = PersistentPagination(paginated, embed, message, interaction.user.id, section)
            await message.edit(view=view)

    except Exception as e:
        logger.error(f"Lookup error: {e}")
        await interaction.followup.send("Failed to perform lookup.", ephemeral=True)

# ---------------------------
# Slash command: /ruling
# AI-powered regelfragen
# ---------------------------
@bot.tree.command(name="ruling", description="Frage den AI-Judge nach einer Regel (Redemption TCG)")
@app_commands.describe(question="Deine Regelfrage")
async def ruling(interaction: discord.Interaction, question: str):
    await interaction.response.defer(thinking=True)
    if not rag_engine:
        await interaction.followup.send("RAG Engine ist zurzeit nicht verfügbar.", ephemeral=True)
        return

    try:
        answer = rag_engine.ask_judge(question)

        paginated = PaginatedText(answer)
        embed = discord.Embed(
            title="AI Judge Ruling",
            color=discord.Color.gold(),
            description=paginated.pages[0]
        )
        embed.set_footer(text=f"Page 1/{paginated.total_pages}")
        
        message = await interaction.followup.send(embed=embed, ephemeral=False)
        if paginated.total_pages > 1:
            view = PersistentPagination(paginated, embed, message, interaction.user.id, question)
            await message.edit(view=view)
    except Exception as e:
        logger.error(f"Ruling error: {e}")
        await interaction.followup.send("Fehler bei der Abfrage der Regel.", ephemeral=True)

# ---------------------------
# Prefix command: !search
# Lets users search for a section directly via text commands
# Useful in environments without slash command support
# ---------------------------
@bot.command(name='search')
async def search_pdf(ctx, doc: str, keyword: str,
                     section_size: int = 30,
                     glossary_size: int = 14,
                     heading_font: str = "Arial"):

    pdf_path = pdfs.get(doc)
    if not pdf_path:
        await ctx.send(f"Document '{doc}' not recognized.")
        return

    section_text, is_glossary_result = extract_section_with_specific_format(
        pdf_path, keyword, section_size, glossary_size, heading_font
    )

    if not section_text:
        await ctx.send(f"'{keyword}' not found in {doc}.")
        return

    paginated = PaginatedText(section_text)
    embed = discord.Embed(
        title=f"{doc} - {'Glossary' if is_glossary_result else 'Section'}: {keyword}",
        color=discord.Color.green() if is_glossary_result else discord.Color.blue()
    )
    embed.description = paginated.pages[0]
    embed.set_footer(text=f"Page 1/{paginated.total_pages}")

    message = await ctx.send(embed=embed)
    if paginated.total_pages > 1:
        view = PersistentPagination(paginated, embed, message, ctx.author.id, keyword)
        await message.edit(view=view)

# ---------------------------
# Bot token loading and startup
# ---------------------------
token = os.getenv("DISCORD_TOKEN")

if not token:
    logger.error("No Discord token found. Please set the DISCORD_TOKEN in .env.")
    exit(1)

bot.run(token)