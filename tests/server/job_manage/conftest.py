"""Import the standalone job-manager modules from the separate test tree."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "server" / "job_manage"))
