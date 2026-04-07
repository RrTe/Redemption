from typing import List, Dict, Any
from scripts.core.parser import DiscordMessage

class RulingExtractor:
    """Extracts Q&A pairs from anonymized Discord messages."""
    
    def __init__(self, messages: List[DiscordMessage]):
        self.messages = messages

    def cluster_messages(self) -> List[Dict[str, Any]]:
        """
        Group messages into logical chunks based on interaction.
        """
        if not self.messages:
            return []

        clusters = []
        current_cluster = []
        last_time = None
        
        # Simple clustering for now: same author within a short window 
        # or follow-up by someone else 
        # (This can be improved with complex @mention tracking)
        for msg in self.messages:
            # For simplicity, we create clusters where 
            # a question starts a cluster and answers follow.
            # Real-world logs are chaotic, so we look for 
            # sequences ending with a judge's response.
            
            # Simple approach for demonstration:
            current_cluster.append({
                "author": msg.author,
                "text": msg.content,
                "timestamp": msg.timestamp,
                "is_judge": "JUDGE" in msg.author
            })
            
            # If a judge responds, it's potentially an end of a unit
            # or if the cluster is getting long.
            if len(current_cluster) > 1 and "JUDGE" in msg.author:
                # We group them and restart (optional logic)
                pass

        # In a real extraction, we would iterate and look for:
        # 1. Question (from USER_XXX)
        # 2. Discussion (optional)
        # 3. Ruling (from JUDGE_XXX)
        
        # Refined Logic:
        final_qa_pairs = []
        processed_questions = set() # To avoid duplicates
        
        # We'll use a sliding window/sequential approach to identify Q&A pairs
        # where one USER asks and one or more JUDGES answer.
        
        for i, msg in enumerate(self.messages):
            # Identifying the start of a potential Q&A unit (Question from USER)
            # Threshold: Must contain "?" or ruling keywords like "how", "what", "can I"
            content_lower = msg.content.lower()
            is_question = "?" in msg.content or any(kw in content_lower for kw in ["how do", "what happens", "can i", "is it possible"])
            
            if is_question and "USER" in msg.author:
                question_block = [msg.content]
                q_author = msg.author
                q_date = msg.timestamp
                
                # Check for duplicates
                full_question_candidate = msg.content
                is_duplicate = False
                for prev_q in processed_questions:
                    if (full_question_candidate in prev_q) or (prev_q in full_question_candidate):
                        is_duplicate = True
                        break
                
                if is_duplicate:
                    continue
                
                # 1. Join sequential messages from the same author (Multi-post questions)
                for k in range(i + 1, min(i + 5, len(self.messages))):
                    next_msg = self.messages[k]
                    if next_msg.author == q_author:
                        question_block.append(next_msg.content)
                    else:
                        break
                
                full_question = "\n".join(question_block)
                
                # 2. Look for responses (Answers)
                answer_block = []
                involved_judges = set()
                
                search_limit = min(i + 25, len(self.messages))
                for j in range(i + len(question_block), search_limit):
                    response_msg = self.messages[j]
                    
                    is_from_judge = "JUDGE" in response_msg.author
                    mentions_user = q_author in response_msg.content
                    is_conclusive = any(res in response_msg.content.lower() for res in ["yes", "no", "correct", "confirmed", "actually"])
                    
                    if is_from_judge or mentions_user or (is_conclusive and j < i + 10):
                        answer_block.append(f"({response_msg.author}): {response_msg.content}")
                        if is_from_judge:
                            involved_judges.add(response_msg.author)

                    if "?" in response_msg.content and "USER" in response_msg.author and response_msg.author != q_author:
                        if len(answer_block) > 0:
                            break
                
                if answer_block and involved_judges:
                    final_qa_pairs.append({
                        "question": full_question,
                        "question_author": q_author,
                        "answer": "\n".join(answer_block),
                        "date": q_date,
                        "judges": list(involved_judges),
                        "source_messages_count": len(question_block) + len(answer_block)
                    })
                    # Mark this question as processed
                    processed_questions.add(full_question)
                    
        return final_qa_pairs
