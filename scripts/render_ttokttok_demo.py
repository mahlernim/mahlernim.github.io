# Optional media build for the ttokttok landing page. Requires Pillow and ffmpeg on PATH.
# Composes the 20-second demo, its poster and the social preview from the app screenshots
# already stored in ttokttok/assets. Media generation is manual, outside the content job.
import os
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

S = 2  # supersample, downscaled at the end
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "ttokttok", "assets")
FONTS = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "Fonts")
INK, GREEN, MUTED, ORANGE = "#193c35", "#086b5d", "#596e63", "#ca5b30"
BG, DARK, LINE, FRAME = "#eef0e5", "#164c40", "#ced8cb", "#21483e"
BOLD, REG = "malgunbd.ttf", "malgun.ttf"

# Each scene pairs one real app screen with the copy describing it.
SCENES = [
    ("meter.png", "01 · 검침", "AI 추정 지침을", "먼저 확인해요.",
     "작년 같은 시기의 사용 흐름과 최근 실측으로 오늘의 누적 지침을 계산해요. "
     "계량기를 봤다면 실제 숫자를 저장해 추정을 조정합니다."),
    ("submission.png", "02 · 제출", "검침 기간과", "입력할 숫자를 보여줘요.",
     "공급사에서 확인한 검침 기간과 기존 제출 여부를 함께 표시해요. "
     "추정한 지침 그대로 지금 직접 제출할 수도 있어요."),
    ("alerts.png", "03 · 자동제출", "켜 두면 마지막 날", "대신 보내요.",
     "최근 실측이 있을 때만 보내도록 조건을 정해 둘 수 있어요. "
     "조건이 하나라도 맞지 않으면 보내지 않고 알림으로 알려드려요."),
    ("history.png", "04 · 추이", "확인할수록", "기록이 쌓여요.",
     "월별 사용량과 실측 기록이 이어져요. 기록이 늘수록 추정이 우리 집 사용 습관에 맞게 조정됩니다."),
]


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size * S)


def text(draw, xy, value, typeface, fill):
    draw.text((xy[0] * S, xy[1] * S), value, font=typeface, fill=fill)


def wrap(draw, value, typeface, width):
    lines, line = [], ""
    for word in value.split(" "):
        trial = (line + " " + word).strip()
        if draw.textlength(trial, font=typeface) > width * S and line:
            lines.append(line)
            line = word
        else:
            line = trial
    if line:
        lines.append(line)
    return lines


def phone(name, height):
    screen = Image.open(os.path.join(ASSETS, name)).convert("RGB")
    width = round(screen.width * height / screen.height)
    screen = screen.resize((width * S, height * S), Image.LANCZOS)
    mask = Image.new("L", screen.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, screen.size[0] - 1, screen.size[1] - 1], radius=20 * S, fill=255)
    return screen, mask, width


def frame(index):
    shot, step, first, second, body = SCENES[index]
    image = Image.new("RGB", (960 * S, 720 * S), BG)
    draw = ImageDraw.Draw(image)
    screen, mask, width = phone(shot, 596)
    x, y, border = 960 - 54 - width, 62, 5
    draw.rounded_rectangle(
        [(x - border) * S, (y - border) * S, (x + width + border) * S, (y + 596 + border) * S],
        radius=25 * S, fill=FRAME)
    image.paste(screen, (x * S, y * S), mask)

    column = x - 54 - 44
    text(draw, (54, 42), "똑똑 자가검침 AI", font(BOLD, 14), INK)
    text(draw, (54, 196), step, font(BOLD, 13), ORANGE)
    text(draw, (54, 232), first, font(BOLD, 37), INK)
    text(draw, (54, 282), second, font(BOLD, 37), GREEN)
    body_font = font(REG, 16)
    for line_index, line in enumerate(wrap(draw, body, body_font, column)):
        text(draw, (54, 358 + line_index * 30), line, body_font, MUTED)

    step_width = (column - 3 * 10) / 4
    for position, scene in enumerate(SCENES):
        step_x = 54 + position * (step_width + 10)
        active = position <= index
        draw.rectangle([step_x * S, 596 * S, (step_x + step_width) * S, 600 * S],
                       fill=GREEN if active else LINE)
        text(draw, (step_x, 614), scene[1].split(" · ")[1],
             font(BOLD if active else REG, 13), GREEN if active else "#667c6e")
    text(draw, (54, 679), "ahn-lab.org/ttokttok/", font(REG, 12), MUTED)
    return image.resize((960, 720), Image.LANCZOS)


def share():
    image = Image.new("RGB", (1200 * S, 630 * S), DARK)
    draw = ImageDraw.Draw(image)
    text(draw, (80, 65), "똑똑 자가검침 AI", font(REG, 24), "#c5d7b1")
    text(draw, (80, 150), "매달 자가검침,", font(BOLD, 74), "#faf9f3")
    text(draw, (80, 250), "이제 자동으로.", font(BOLD, 74), "#faf9f3")
    text(draw, (80, 380), "평소에 확인하고, 검침 기간엔 자동 제출.", font(REG, 25), "#d1dfd5")
    text(draw, (80, 500), "Android 무료 테스트 · 전국 30곳 공급사 연결", font(REG, 19), "#bdcfbb")
    text(draw, (80, 534), "ahn-lab.org/ttokttok/", font(REG, 19), "#bdcfbb")
    return image.resize((1200, 630), Image.LANCZOS)


def main():
    tmp = tempfile.mkdtemp(prefix="ttokttok-demo-")
    clips = []
    for index in range(len(SCENES)):
        image = frame(index)
        still = os.path.join(tmp, "%d.png" % index)
        image.save(still)
        if index == 0:
            image.save(os.path.join(ASSETS, "poster.png"), optimize=True)
        clip = os.path.join(tmp, "%d.mp4" % index)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", still, "-t", "5",
             "-vf", "fade=t=in:st=0:d=0.3,fade=t=out:st=4.7:d=0.3,format=yuv420p",
             "-r", "24", "-c:v", "libx264", "-crf", "22", clip], check=True)
        clips.append(clip)

    listing = os.path.join(tmp, "clips.txt")
    with open(listing, "w", encoding="utf-8") as handle:
        handle.write("\n".join("file '%s'" % c.replace("\\", "/") for c in clips))
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listing,
         "-c", "copy", "-movflags", "+faststart", os.path.join(ASSETS, "demo.mp4")], check=True)
    share().save(os.path.join(ASSETS, "share.png"), optimize=True)
    print("Created 20-second demo.mp4, poster.png and share.png")


if __name__ == "__main__":
    main()
