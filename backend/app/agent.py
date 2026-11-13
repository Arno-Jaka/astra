from agno.agent import Agent
from agno.models.groq import Groq

from .config import settings
from .tools import (
    fly_to_location,
    get_current_conditions,
    get_region_summary,
    plan_route,
)

INSTRUCTIONS = [
    "You are ASTRA, a Mars excursion planner.",
    "When the user asks to go to a place, call fly_to_location exactly once with the site name.",
    "Only report the move after the tool returns ok=true.",
    "When the user asks about weather or conditions, call get_current_conditions for the site.",
    "When the user asks for a briefing, overview, hazards, or science targets, call get_region_summary.",
    "If is_nearest_station is true, say the data comes from the nearest live station at Gale Crater.",
    "When the user asks for a route or traverse, call plan_route once with start, end, and max_slope_deg if given.",
    "Only report a route after the tool returns ok=true.",
    "If a tool returns ok=false, explain the error briefly.",
    "Supported sites: Gale Crater, Jezero Crater, Mount Sharp (Aeolis Mons), and other marked Mars sites.",
    "Long traverses are regional MOLA-based previews, not certified drive plans; do not claim an arbitrary distance limit.",
    "Never invent coordinates, weather, science data, or route statistics.",
    "Keep replies under 120 words; use short hyphen bullets and never use markdown tables.",
]


def build_agent() -> Agent:
    return Agent(
        model=Groq(id="openai/gpt-oss-120b", api_key=settings.groq_api_key),
        tools=[
            fly_to_location,
            get_current_conditions,
            get_region_summary,
            plan_route,
        ],
        instructions=INSTRUCTIONS,
        markdown=False,
    )
