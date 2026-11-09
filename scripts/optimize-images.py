"""Generate the web assets from the preserved original images (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageOps

public = Path(__file__).resolve().parent.parent / 'public'
output = public / 'media'
output.mkdir(exist_ok=True)

for original in sorted(public.glob('*.jpg')):
    with Image.open(original) as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
        for width in (480, 960, 1280):
            resized = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
            resized.save(output / f'{original.stem}-{width}.webp', quality=78, method=6)

for filename, target, width in [('logo1.png', 'logo-compact.webp', 320), ('logo2.png', 'logo-wide.webp', 724)]:
    with Image.open(public / filename) as image:
        resized = image.convert('RGBA').resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        resized.save(output / target, quality=90, method=6)

print(f'Generated {len(list(output.glob("*.webp")))} images; original files preserved.')
