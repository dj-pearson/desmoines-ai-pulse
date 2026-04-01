from PIL import Image, ImageDraw, ImageFilter
import os
import sys

def create_gradient(width, height):
    # A clean, light-themed gradient (White to a very light blue-gray)
    base = Image.new('RGB', (width, height), '#ffffff')
    draw = ImageDraw.Draw(base)
    for y in range(height):
        factor = y / height
        # Transition from #ffffff to #f0f4f8 (slate/blueish light gray)
        r = int(255 - (255 - 240) * factor)
        g = int(255 - (255 - 244) * factor)
        b = int(255 - (255 - 248) * factor)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    return base

def main():
    WIDTH = 1024
    HEIGHT = 500
    
    bg = create_gradient(WIDTH, HEIGHT)
    
    try:
        logo_path = os.path.join('public', 'DMI-Logo-Header.png')
        logo = Image.open(logo_path).convert("RGBA")
        
        target_width = 800
        aspect_ratio = logo.size[1] / logo.size[0]
        target_height = int(target_width * aspect_ratio)
        
        logo = logo.resize((target_width, target_height), Image.Resampling.LANCZOS)
        
        x = (WIDTH - target_width) // 2
        y = (HEIGHT - target_height) // 2
        
        # Add a subtle drop shadow
        shadow = Image.new('RGBA', bg.size, (0, 0, 0, 0))
        shadow.paste((0, 0, 0, 40), (x, y + 10), logo)
        shadow = shadow.filter(ImageFilter.GaussianBlur(15))
        
        bg.paste(shadow, (0, 0), shadow)
        bg.paste(logo, (x, y), logo)
            
    except Exception as e:
        print(f"Error putting logo on background: {e}")
        sys.exit(1)
        
    out_png = os.path.join('public', 'feature-graphic.png')
    bg.save(out_png)
    print(f"Successfully generated {out_png}")

if __name__ == '__main__':
    main()
