from vllm import LLM, SamplingParams

def get_llm():
    return LLM(model="meta-llama/Llama-3.1-8B-Instruct")