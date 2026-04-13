import { Outfit } from "next/font/google";
import Experience from "../components/landing/Experience";
import { Navbar } from "../components/landing/Navbar";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
});

export default function Home() {
  return (
    <main className={`bg-black ${outfit.className}`}>
      <Navbar />
      <Experience />
    </main>
  );
}
