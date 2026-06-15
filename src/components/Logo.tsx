/** Wordmark de Hitazo (liviano, escalable). La "A" en acento, como el ícono. */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold uppercase tracking-tight ${className}`}>
      Hit<span className="text-accent">a</span>zo
    </span>
  );
}
