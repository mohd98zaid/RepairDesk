import { Outfit } from "next/font/google";
import Experience from "../components/landing/Experience";
import { Navbar } from "../components/landing/Navbar";
import { SmoothScroll } from "../components/landing/SmoothScroll";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
});

export default function Home() {
  return (
    <main className={`bg-black ${outfit.className}`}>
      <SmoothScroll />
      <Navbar />
      <Experience />
    </main>
  );
}
