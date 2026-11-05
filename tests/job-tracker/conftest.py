"""Import the standalone job-tracker modules from the separate test tree."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "job-tracker"))
