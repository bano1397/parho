"""Generate Parho's 3 FAKE sample documents (no real people, companies or numbers).

All names are invented, CNIC is 00000-0000000-0, phone 0300-0000000.
Run: python make_samples.py  (needs Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
F = "/System/Library/Fonts/Supplemental/Arial.ttf"
FB = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(size, bold=False):
    return ImageFont.truetype(FB if bold else F, size)


def page(lines, name, w=1200, h=1600):
    img = Image.new("RGB", (w, h), (250, 248, 240))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, w - 20, h - 20], outline=(40, 40, 40), width=3)
    y = 50
    for text, size, bold in lines:
        if text == "---":
            d.line([50, y + 10, w - 50, y + 10], fill=(90, 90, 90), width=2)
            y += 30
            continue
        d.text((60, y), text, font=font(size, bold), fill=(20, 20, 20))
        y += int(size * 1.6)
    d.text((60, h - 70), "SAMPLE DOCUMENT - FAKE DATA - NOT A REAL BILL", font=font(22, True), fill=(180, 30, 30))
    img.save(OUT / name)


page([
    ("SAMPLE CITY POWER COMPANY", 44, True),
    ("Electricity Bill - November 2026", 30, False),
    ("---", 0, False),
    ("Consumer Name:  Ahmed Fake Khan", 28, False),
    ("CNIC:  00000-0000000-0", 28, False),
    ("Address:  House 0, Street 0, Sample Town, Lahore", 28, False),
    ("Consumer ID:  0000000000000", 28, False),
    ("Phone:  0300-0000000", 28, False),
    ("---", 0, False),
    ("Billing Month:  NOV-2026", 30, True),
    ("Units Consumed:  412", 30, True),
    ("Previous Month Units:  188", 28, False),
    ("Amount Due Within Due Date:  Rs 18,450", 34, True),
    ("Due Date:  24-11-2026", 34, True),
    ("Amount After Due Date:  Rs 20,295", 30, False),
    ("Late Payment Surcharge:  10%", 28, False),
    ("---", 0, False),
    ("History:  Oct 188 | Sep 205 | Aug 260 | Jul 274", 26, False),
], "sample_bill.png")

page([
    ("SAMPLE GAS DISTRIBUTION LTD", 44, True),
    ("FINAL NOTICE - Disconnection Warning", 32, True),
    ("---", 0, False),
    ("To:  Fatima Fake Bibi", 28, False),
    ("CNIC:  00000-0000000-0", 28, False),
    ("Address:  Flat 0, Block Z, Sample Colony, Karachi", 28, False),
    ("Account No:  0000000000", 28, False),
    ("---", 0, False),
    ("Your gas bill of Rs 6,780 is unpaid since September 2026.", 28, False),
    ("Please pay the outstanding amount by 30-11-2026.", 28, True),
    ("If payment is not received, your gas connection", 28, False),
    ("will be disconnected without further notice.", 28, False),
    ("Reconnection fee: Rs 1,500.", 28, False),
    ("Pay at any bank branch or through mobile banking.", 28, False),
    ("Helpline:  0300-0000000", 28, False),
], "sample_notice.png")

page([
    ("SAMPLEMOL 500 mg", 48, True),
    ("Paracetamol Tablets  (FAKE PRODUCT FOR DEMO)", 30, False),
    ("---", 0, False),
    ("Each tablet contains: Paracetamol BP 500 mg", 28, False),
    ("Dosage: Adults 1-2 tablets every 4-6 hours.", 28, True),
    ("Do not take more than 8 tablets in 24 hours.", 28, True),
    ("Children: as directed by the physician.", 28, False),
    ("Warning: Do not use with other paracetamol products.", 28, False),
    ("Store below 30 C, away from light and moisture.", 28, False),
    ("---", 0, False),
    ("Batch No:  S-0000", 28, False),
    ("Mfg Date:  01-2026", 28, False),
    ("Expiry Date:  12-2027", 32, True),
    ("Manufactured by: Sample Pharma (Fictional)", 26, False),
    ("Retail Price: Rs 45 per strip of 10", 28, False),
], "sample_medicine.png")

print("made 3 samples in", OUT)
