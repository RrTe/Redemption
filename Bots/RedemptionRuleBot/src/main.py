import sys
import os
import re

# Wispbyte Start-Fix: Ensure the root directory is in sys.path
# This allows Wispbyte to find the "scripts" package when running src/main.py
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)


# --- One-time cleanup for Wispbyte migration ---
# pinecone==8.1.1 actively raises DeprecatedPluginError if it detects the old
# pinecone-plugin-inference package (a leftover from pinecone-client==5.0.1).
# We uninstall it here, before any pinecone import is triggered.
import subprocess
_cleanup_result = subprocess.run(
    [sys.executable, "-m", "pip", "uninstall", "-y", "pinecone-plugin-inference"],
    capture_output=True, text=True
)
if "Successfully uninstalled" in _cleanup_result.stdout:
    print("[CLEANUP] Removed deprecated pinecone-plugin-inference.")
# ------------------------------------------------


import discord
from discord.ext import commands
import fitz  # PyMuPDF - used for parsing PDF content
import logging
import json
import time
import glob
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
# SYNC_STATE_FILE uses BASE_DIR to be robust regardless of the working directory
SYNC_STATE_FILE = os.path.join(BASE_DIR, "data", "sync_state.json")

# SYNC_INTERVAL_MINUTES can be overridden via .env for local testing (e.g. 5 minutes).
# Defaults to 1440 minutes (24 hours) for production.
SYNC_INTERVAL_MINUTES = int(os.getenv("SYNC_INTERVAL_MINUTES", "1440"))

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

@tasks.loop(minutes=SYNC_INTERVAL_MINUTES)
async def auto_sync_rulings():
    channel_id = os.getenv("RULING_CHANNEL_ID")
    if not channel_id or not rag_engine:
        return
        
    try:
        channel = bot.get_channel(int(channel_id))
        if not channel:
            logger.warning(f"Auto-Sync: Channel {channel_id} not found.")
            return

        # Check for history permissions to avoid 403 Forbidden
        permissions = channel.permissions_for(channel.guild.me)
        if not permissions.read_message_history:
            logger.warning(f"Auto-Sync: Missing 'Read Message History' permission in channel {channel.name}.")
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
            
        shield = get_protective_shield("data/carddata.json")
        judges = get_official_judges()
        
        user_map = create_user_mapping(parsed_msgs, judges, shield)
        anonymizer = RuleAnonymizer(user_map, shield)
        
        for msg in parsed_msgs:
            msg.author = user_map.get(msg.author, "UNKNOWN_USER")
            msg.content = anonymizer.anonymize_text(msg.content)
            
        extractor = RulingExtractor(parsed_msgs)
        qa_pairs = extractor.cluster_messages()
        
        if qa_pairs:
            rulings_file = "data/processed_rulings_final.json"
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

def discover_pdfs(directory="data"):
    """
    Scans the directory for PDFs and creates a mapping.
    Category is the first part of the filename (e.g. REG_v11.pdf -> REG).
    """
    found_pdfs = {}
    if not os.path.exists(directory):
        return found_pdfs
        
    # Default categories in case the config file is missing
    known_categories = ["REG", "ORDIR", "Rulebook", "DeckBuilding"]
    
    # Try to load categories from an external file for easier management
    cat_file = os.path.join(directory, "categories.txt")
    if os.path.exists(cat_file):
        try:
            with open(cat_file, "r", encoding="utf-8") as f:
                custom_cats = [line.strip() for line in f if line.strip()]
                if custom_cats:
                    known_categories = custom_cats
                    logger.info(f"Loaded {len(known_categories)} categories from {cat_file}")
        except Exception as e:
            logger.error(f"Failed to read {cat_file}: {e}")
    
    for file_path in glob.glob(os.path.join(directory, "*.pdf")):
        filename = os.path.basename(file_path)
        filename_upper = filename.upper()
        
        # Try to find a known category in the name first
        assigned_category = None
        for cat in known_categories:
            if cat.upper() in filename_upper:
                assigned_category = cat
                break
        
        # Fallback for unknown documents: use first part of filename
        if not assigned_category:
            assigned_category = re.split(r'[_ ]', filename)[0].replace(".pdf", "")
            
        if assigned_category not in found_pdfs:
            found_pdfs[assigned_category] = file_path
            
    return found_pdfs

# Global mapping of logical document identifiers to actual PDF files
# Populated at startup via discover_pdfs()
pdfs = {}

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
    """
    Extracts structured sections (Title -> Metadata) from a PDF at startup.
    Captures content between identified headers and tracks glossary status.
    """
    try:
        doc = fitz.open(pdf_path)
        sections = {}
        current_title = None
        current_content = []
        is_glossary_mode = False
        
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

                    if not line_text:
                        continue

                    # Identical triggers to main.py's original logic
                    if line_text == "Special Ability Structure" and font_size == 36 and "Arial" in font_name:
                        tracking = True
                        use_heading_size2 = False
                        is_glossary_mode = False
                    if line_text == "Glossary of Terms" and font_size == 36 and "Arial" in font_name:
                        use_heading_size2 = True
                        tracking = True
                        is_glossary_mode = True
                        continue

                    is_heading = False
                    if tracking:
                        font_matches = heading_font.lower() in (line_font or "").lower()
                        if not use_heading_size2:
                            if font_size == heading_size1 and font_matches:
                                is_heading = True
                        else:
                            if font_size == heading_size2 and font_matches:
                                is_heading = True

                    if is_heading:
                        if current_title and current_content:
                            sections[current_title] = {
                                "content": "\n".join(current_content).strip(),
                                "is_glossary": is_glossary_mode
                            }
                        current_title = line_text
                        current_content = []
                    elif current_title:
                        current_content.append(line_text)

        if current_title and current_content:
            sections[current_title] = {
                "content": "\n".join(current_content).strip(),
                "is_glossary": is_glossary_mode
            }
            
        return sections

    except Exception as e:
        logger.error(f"Error extracting sections from {pdf_path}: {str(e)}")
        return {}

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

    # Load section data dynamically from found PDFs
    global pdfs
    pdfs = discover_pdfs("data")
    logger.info(f"Discovered {len(pdfs)} PDF categories: {list(pdfs.keys())}")

    all_sections = {}
    for doc_key, path in pdfs.items():
        if os.path.exists(path):
            sections = extract_sections(path, heading_size1=30, heading_size2=14, heading_font="Arial")
            section_titles_by_doc[doc_key] = sorted(list(sections.keys()))
            all_sections[doc_key] = sections
            logger.info(f"{doc_key}: Extracted {len(sections)} sections (titles + content)")
        else:
            logger.warning(f"{doc_key} PDF not found at {path}")

    # Inject the captured rule sections into the RAG KnowledgeManager
    if all_sections:
        rag_engine.km.rule_sections = all_sections
        logger.info("RAG Engine updated with live PDF rule sections.")

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
        
        # Access the preloaded section data from the KnowledgeManager
        doc_sections = rag_engine.km.rule_sections.get(doc_key, {})
        section_data = doc_sections.get(section_title)
        
        if not section_data:
            await interaction.followup.send(f"'{section_title}' content not found for {doc_key}. Please restart bot if PDFs were updated.", ephemeral=True)
            return

        section_text = section_data["content"]
        is_glossary_result = section_data["is_glossary"]

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
# Slash command: /find
# Pure factual search for Discord rulings and rule snippets (No AI)
# ---------------------------
@bot.tree.command(name="find", description="Sucht direkt in Discord-Rulings und Regeln (ohne KI-Interpretation)")
@app_commands.describe(query="Suchbegriff oder Frage")
async def search_rulings(interaction: discord.Interaction, query: str):
    await interaction.response.defer(thinking=True)
    if not rag_engine:
        await interaction.followup.send("RAG Engine ist zurzeit nicht verfügbar.", ephemeral=True)
        return

    try:
        results = rag_engine.search_only(query)

        paginated = PaginatedText(results)
        embed = discord.Embed(
            title=f"Suchergebnisse: {query}",
            color=discord.Color.blue(),
            description=paginated.pages[0]
        )
        embed.set_footer(text=f"Page 1/{paginated.total_pages}")
        
        message = await interaction.followup.send(embed=embed, ephemeral=False)
        if paginated.total_pages > 1:
            view = PersistentPagination(paginated, embed, message, interaction.user.id, query)
            await message.edit(view=view)
    except Exception as e:
        logger.error(f"Search error: {e}")
        await interaction.followup.send("Fehler bei der Suche.", ephemeral=True)

# ---------------------------
# Prefix command: !search
# Lets users search for a section directly via text commands
# Useful in environments without slash command support
# ---------------------------
@bot.command(name='search')
async def search_pdf(ctx, doc: str = None, keyword: str = None,
                     section_size: int = 30,
                     glossary_size: int = 14,
                     heading_font: str = "Arial"):

    if not doc or not keyword:
        # Provide a helpful usage instruction instead of crashing
        available_docs = ", ".join(pdfs.keys()) if 'pdfs' in globals() else "Unbekannt"
        await ctx.send(f"❌ **Fehlende Argumente!**\nVerwendung: `!search <Dokument> <Suchbegriff>`\nBeispiel: `!search REG Abomination`\nVerfügbare Dokumente: {available_docs}")
        return

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
# Prefix command: !sync
# Forces synchronization of slash commands for the current guild
# ---------------------------
@bot.command(name='sync')
async def sync_commands(ctx):
    try:
        # Syncing to the current guild for immediate results
        synced = await bot.tree.sync()
        await ctx.send(f"✅ Synchronisierte {len(synced)} Slash-Commands global.")
        
        # Also sync to this specific guild for instant updates
        bot.tree.copy_global_to(guild=ctx.guild)
        synced_guild = await bot.tree.sync(guild=ctx.guild)
        await ctx.send(f"🚀 Sofort-Update für diesen Server durchgeführt ({len(synced_guild)} Kommandos).")
    except Exception as e:
        await ctx.send(f"❌ Fehler beim Synchronisieren: {e}")

# ---------------------------
# Bot token loading and startup
# ---------------------------
token = os.getenv("DISCORD_TOKEN")

if not token:
    logger.error("No Discord token found. Please set the DISCORD_TOKEN in .env.")
    exit(1)

bot.run(token)