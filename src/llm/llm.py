from vllm import LLM

def get_llm():
    return LLM(model="mistralai/Mistral-7B-Instruct-v0.3")