import { ClassesManager } from "./ClassesManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Classes | Cocoon Admin" };

export default function ClassesPage() {
  return (
    <div>
      <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl mb-6">
        Make-Up Classes
      </h1>
      <ClassesManager />
    </div>
  );
}
