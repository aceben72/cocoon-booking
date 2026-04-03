import Image from "next/image";
import Link from "next/link";

export default function BookingHeader() {
  return (
    <header className="bg-[#044e77] py-5 px-6 flex items-center justify-center">
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="https://mcusercontent.com/644ef8c7fbae49e3b1826dda3/images/1b7a3cb7-18c0-682d-62bf-921900b53c86.png"
          alt="Cocoon Skin & Beauty"
          width={120}
          height={50}
          className="h-12 w-auto object-contain"
          priority
          unoptimized
        />
      </Link>
    </header>
  );
}
