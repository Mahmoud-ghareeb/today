from vllm import LLM

def get_llm():
    return LLM(model="CohereForAI/c4ai-command-r7b-12-2024")