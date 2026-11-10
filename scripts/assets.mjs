import fs from "node:fs/promises";
const photos = {
  "audio.jpg": "photo-1546435770-a3e426bf472b",
  "hero.jpg": "photo-1618366712010-f4ae9c647dcb",
  "keyboard.jpg": "photo-1618384887929-16ec33fab9ef",
  "mouse.jpg": "photo-1527814050087-3793815479db",
  "controller.jpg": "photo-1606318801954-d46d46d3360a",
  "storage.jpg": "photo-1531492746076-161ca9bcad58",
  "hub.jpg": "photo-1625842268584-8f3296236761",
  "speaker.jpg": "photo-1608043152269-423dbba4e7e1",
  "router.jpg": "photo-1558494949-ef010cbdcc31",
  "monitor.jpg": "photo-1527443224154-c4a3942d3acf",
  "desk.jpg": "photo-1593305841991-05c297ba4575",
  "software.jpg": "photo-1635070041078-e363dbe005cb",
  "earbuds.jpg": "photo-1606220945770-b5b6c2c55bf1",
  "setup.jpg": "photo-1593305841991-05c297ba4575",
};
await fs.mkdir("public/images", { recursive: true });
await Promise.all(
  Object.entries(photos).map(async ([name, id]) => {
    try {
      const response = await fetch(
        `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${name === "hero.jpg" || name === "setup.jpg" ? 1200 : 650}&q=85`,
      );
      if (!response.ok) throw new Error(String(response.status));
      await fs.writeFile(
        `public/images/${name}`,
        Buffer.from(await response.arrayBuffer()),
      );
      console.log(`${name}: OK`);
    } catch (e) {
      console.log(`${name}: ${e.message}`);
    }
  }),
);
