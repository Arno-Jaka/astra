from agno.agent import Agent
from agno.models.groq import Groq

from .config import settings
from .tools import fly_to_location

INSTRUCTIONS = [
    "You are ASTRA, a Mars excursion planner.",
    "When the user asks to go to a place, call fly_to_location exactly once with the site name.",
    "Only report the move after the tool returns ok=true.",
    "If the tool returns ok=false, explain the error briefly.",
    "Only Gale Crater and Jezero Crater are supported; do not offer other sites.",
    "Never invent coordinates, weather, or science data.",
]


def build_agent() -> Agent:
    return Agent(
        model=Groq(id="openai/gpt-oss-120b", api_key=settings.groq_api_key),
        tools=[fly_to_location],
        instructions=INSTRUCTIONS,
        markdown=False,
    )
