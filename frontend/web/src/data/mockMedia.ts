const TWEMOJI_128 = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/128x128";

export interface DemoGif {
  id: string;
  title: string;
  previewUrl: string;
}

export interface DemoSticker {
  id: string;
  label: string;
  /** High-res sticker asset (not inline emoji size). */
  imageUrl: string;
}

export const DEMO_GIFS: DemoGif[] = [
  {
    id: "g1",
    title: "Celebrate",
    previewUrl: "https://media.giphy.com/media/ICOgUNjpvO0WA/giphy.gif",
  },
  {
    id: "g2",
    title: "Thumbs up",
    previewUrl: "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif",
  },
  {
    id: "g3",
    title: "Hello",
    previewUrl: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  },
  {
    id: "g4",
    title: "Cool",
    previewUrl: "https://media.giphy.com/media/26BRvcoTiVhMYC5Ms/giphy.gif",
  },
  {
    id: "g5",
    title: "Love",
    previewUrl: "https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif",
  },
  {
    id: "g6",
    title: "Wow",
    previewUrl: "https://media.giphy.com/media/5VKbvrjqqEvfi5aa8e/giphy.gif",
  },
  {
    id: "g7",
    title: "Dance",
    previewUrl: "https://media.giphy.com/media/26ufdipW3lJc6jpCA/giphy.gif",
  },
  {
    id: "g8",
    title: "Yes",
    previewUrl: "https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif",
  },
];

export const DEMO_STICKERS: DemoSticker[] = [
  { id: "st1", label: "Cat", imageUrl: `${TWEMOJI_128}/1f436.png` },
  { id: "st2", label: "Fire", imageUrl: `${TWEMOJI_128}/1f525.png` },
  { id: "st3", label: "Party", imageUrl: `${TWEMOJI_128}/1f389.png` },
  { id: "st4", label: "Heart", imageUrl: `${TWEMOJI_128}/1f49c.png` },
  { id: "st5", label: "Star", imageUrl: `${TWEMOJI_128}/2b50.png` },
  { id: "st6", label: "Rocket", imageUrl: `${TWEMOJI_128}/1f680.png` },
  { id: "st7", label: "Ghost", imageUrl: `${TWEMOJI_128}/1f47b.png` },
  { id: "st8", label: "Clap", imageUrl: `${TWEMOJI_128}/1f44f.png` },
  { id: "st9", label: "100", imageUrl: `${TWEMOJI_128}/1f4af.png` },
  { id: "st10", label: "Wave", imageUrl: `${TWEMOJI_128}/1f44b.png` },
  { id: "st11", label: "Cool", imageUrl: `${TWEMOJI_128}/1f60e.png` },
  { id: "st12", label: "Think", imageUrl: `${TWEMOJI_128}/1f914.png` },
  { id: "st13", label: "Laugh", imageUrl: `${TWEMOJI_128}/1f602.png` },
  { id: "st14", label: "Love eyes", imageUrl: `${TWEMOJI_128}/1f60d.png` },
  { id: "st15", label: "OK", imageUrl: `${TWEMOJI_128}/1f44c.png` },
];
