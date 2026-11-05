"""Package the unpacked Chrome extension without local or generated files."""

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=root / "build" / "AutoApply-extension.zip"
    )
    destination = parser.parse_args().output.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    source = root / "extension"
    with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob("*")):
            relative = path.relative_to(source)
            if (
                not path.is_file()
                or any(part.startswith(".") for part in relative.parts)
                or "output" in relative.parts
                or path.suffix == ".md"
            ):
                continue
            archive.write(path, Path("extension") / relative)
    print(destination)


if __name__ == "__main__":
    main()
