const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");

// Register font (make sure meron kang .ttf file sa fonts folder mo)
registerFont(path.join(__dirname, "fonts", "Poppins-Bold.ttf"), {
  family: "Poppins",
});

async function generateBanner() {
  const width = 1200;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#4f46e5"); // indigo
  gradient.addColorStop(1, "#0ea5e9"); // sky blue
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Title text
  ctx.fillStyle = "#fff";
  ctx.font = "bold 70px Poppins";
  ctx.textAlign = "center";
  ctx.fillText("🚀 ShareBoost", width / 2, height / 2 - 20);

  // Subtitle
  ctx.font = "30px Poppins";
  ctx.fillText("Grow smarter. Share faster.", width / 2, height / 2 + 50);

  // Optional: load a logo image (replace with your path/logo.png)
  try {
    const logo = await loadImage(path.join(__dirname, "logo.png"));
    const logoSize = 100;
    ctx.drawImage(
      logo,
      width / 2 - logoSize / 2,
      height - logoSize - 30,
      logoSize,
      logoSize
    );
  } catch (e) {
    console.log("No logo.png found, skipping logo...");
  }

  // Save as banner.png
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync("banner.png", buffer);
  console.log("✅ Banner generated: banner.png");
}

generateBanner();
