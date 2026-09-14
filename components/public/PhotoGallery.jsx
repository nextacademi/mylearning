// Uniform 3x2 photo grid with a category tag + title overlay per cell,
// matching the reference site's gallery layout. Every image is a real,
// local Next Academy photo (public/tranning*.jpeg) — no stock/fabricated
// imagery.
export default function PhotoGallery({ items }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.title} className="group relative aspect-[4/3] overflow-hidden rounded-2xl">
          <img
            src={item.src}
            alt={item.title}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 p-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#F04438]">
              {item.category}
            </p>
            <p className="mt-1 text-lg font-bold text-white">{item.title}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
