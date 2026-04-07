import os

def extract_sample(input_path: str, output_path: str, num_lines: int = 5000, start_line: int = 10000):
    """
    Extract a sample of lines from the huge log file.
    """
    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found.")
        return

    print(f"Extracting {num_lines} lines starting at {start_line} from {input_path}...")
    
    with open(input_path, 'r', encoding='utf-8') as f_in:
        # Skip to start_line
        for _ in range(start_line):
            f_in.readline()
        
        with open(output_path, 'w', encoding='utf-8') as f_out:
            for _ in range(num_lines):
                line = f_in.readline()
                if not line:
                    break
                f_out.write(line)
                
    print(f"Sample saved to {output_path}.")

if __name__ == "__main__":
    extract_sample("data/DiscordRulings.txt", "data/DiscordRulings_sample.txt")
