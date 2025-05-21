from vllm import LLM, SamplingParams
import yaml

def get_llm():

    with open("configs/config.yml", "r") as f:
        config = yaml.safe_load(f)
    
    llm_config = config["app"]["llm"]

    llm = LLM(
        model=llm_config["model"],
        device=llm_config["device"]
    )
    
    return llm

def get_sampling_params(config_name="default"):
    
    with open("configs/config.yml", "r") as f:
        config = yaml.safe_load(f)

    llm_config = config["app"]["llm"]

    sampling_params = SamplingParams(
        temperature=llm_config["temperature"],
        top_p=llm_config["top_p"],
        top_k=llm_config["top_k"],
        max_tokens=llm_config["max_tokens"],
        repetition_penalty=llm_config["repetition_penalty"],
        stop=llm_config["stop_tokens"]
    )

    return sampling_params
