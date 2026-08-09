# OffloadMaster 应用图标 —— 深色圆角底 + 琥珀金存储卡 + 胶片条 + 校验对勾
# 2 倍超采样绘制后降到 1024，保证边缘平滑
from PIL import Image, ImageDraw

S = 2          # 超采样倍数
W = 1024 * S
img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

def sc(v):
    return int(v * S)

def lerp(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))

def vgradient_rect(draw, box, radius, c_top, c_bottom):
    """圆角矩形内的竖直渐变：先画渐变矩形，再用圆角蒙版裁剪"""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    grad = Image.new('RGBA', (w, h))
    gd = ImageDraw.Draw(grad)
    for y in range(h):
        gd.line([(0, y), (w, y)], fill=lerp(c_top, c_bottom, y / max(h - 1, 1)) + (255,))
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    img.paste(grad, (x0, y0), mask)

# ---------------- 背景：macOS 风格深色圆角方块 ----------------
vgradient_rect(d, (sc(100), sc(100), sc(924), sc(924)), sc(200), (43, 43, 48), (16, 16, 19))

# ---------------- 存储卡：琥珀金竖卡 ----------------
card = (sc(342), sc(296), sc(682), sc(724))
vgradient_rect(d, card, sc(56), (252, 211, 106), (232, 150, 22))
# 顶部金属触点（五枚，像 SD/CFexpress 卡的金手指）
for i in range(5):
    px = 392 + i * 54
    d.rounded_rectangle([sc(px), sc(330), sc(px + 34), sc(392)], radius=sc(8), fill=(166, 96, 16, 255))

# ---------------- 胶片条：横贯卡面中部 ----------------
strip_y0, strip_y1 = sc(460), sc(580)
d.rectangle([sc(342), strip_y0, sc(682), strip_y1], fill=(28, 25, 23, 255))
# 上下两排片孔
for row_y in (472, 552):
    for i in range(6):
        hx = 372 + i * 50
        d.rounded_rectangle([sc(hx), sc(row_y), sc(hx + 22), sc(row_y + 16)], radius=sc(4), fill=(253, 230, 138, 255))
# 中间一格画面框（浅框代表一帧素材）
d.rounded_rectangle([sc(452), sc(496), sc(572), sc(544)], radius=sc(6), outline=(253, 230, 138, 255), width=sc(5))

# ---------------- 校验徽章：翠绿圆 + 白对勾，压在卡的右下角 ----------------
cx, cy, r = sc(700), sc(716), sc(96)
d.ellipse([cx - r - sc(10), cy - r - sc(10), cx + r + sc(10), cy + r + sc(10)], fill=(13, 13, 15, 255))  # 深色描边圈
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(16, 185, 129, 255))
# 对勾（两条粗线）
lw = sc(26)
d.line([(cx - sc(44), cy + sc(2)), (cx - sc(10), cy + sc(38))], fill=(255, 255, 255, 255), width=lw)
d.line([(cx - sc(10), cy + sc(38)), (cx + sc(50), cy - sc(34))], fill=(255, 255, 255, 255), width=lw)
# 对勾端点圆头
for px, py in ((cx - sc(44), cy + sc(2)), (cx - sc(10), cy + sc(38)), (cx + sc(50), cy - sc(34))):
    d.ellipse([px - lw // 2, py - lw // 2, px + lw // 2, py + lw // 2], fill=(255, 255, 255, 255))

# ---------------- 降到 1024 输出 ----------------
img = img.resize((1024, 1024), Image.LANCZOS)
img.save('build/icon.png')
print('saved build/icon.png')
