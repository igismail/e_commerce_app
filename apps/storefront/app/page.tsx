const collections = [
  { title: 'Everyday essentials', count: '01 / 04' },
  { title: 'Made for the outdoors', count: '02 / 04' },
  { title: 'A calmer home', count: '03 / 04' },
  { title: 'Objects with purpose', count: '04 / 04' },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10">
        <a
          aria-label="Commerce home"
          className="text-xl font-semibold tracking-[-0.06em]"
          href="/"
        >
          commerce<span className="text-leaf">.</span>
        </a>
        <nav aria-label="Main navigation" className="flex items-center gap-6 text-sm">
          <a className="transition-colors hover:text-leaf" href="#collections">
            Collections
          </a>
          <a className="transition-colors hover:text-leaf" href="#about">
            Our approach
          </a>
          <a
            aria-label="Shopping bag, 0 items"
            className="rounded-full border border-ink/15 px-4 py-2 transition-colors hover:border-ink"
            href="/cart"
          >
            Bag (0)
          </a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 pb-20 pt-16 md:grid-cols-[1.2fr_0.8fr] md:items-end md:px-10 md:pb-28 md:pt-24">
        <div>
          <p className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-leaf">
            Better things, made to last
          </p>
          <h1 className="max-w-3xl text-5xl font-medium leading-[0.98] tracking-[-0.065em] md:text-7xl">
            A little more thought in the things we choose.
          </h1>
        </div>
        <div className="max-w-md pb-1 md:justify-self-end">
          <p className="text-base leading-7 text-ink/70">
            Discover useful, well-made pieces for your everyday. Thoughtful
            materials, enduring design, and the details that make a difference.
          </p>
          <a
            className="mt-7 inline-flex items-center gap-3 border-b border-ink pb-2 text-sm font-medium"
            href="/products"
          >
            Explore the collection <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section
        aria-label="Featured collection"
        className="mx-6 grid min-h-[360px] max-w-7xl grid-cols-2 overflow-hidden rounded-sm bg-[#d9ded3] md:mx-auto md:min-h-[520px] md:grid-cols-4"
      >
        {collections.map((collection, index) => (
          <article
            className={`flex flex-col justify-between border-ink/10 p-5 md:p-7 ${
              index % 2 === 0 ? 'bg-[#e2e5dc]' : 'bg-[#d5dbd1]'
            } ${index < 2 ? 'border-b md:border-b-0' : ''} ${
              index % 2 === 0 ? 'border-r' : ''
            } md:border-r`}
            key={collection.count}
          >
            <p className="text-xs text-ink/55">{collection.count}</p>
            <h2 className="max-w-[12rem] text-xl leading-tight tracking-[-0.04em] md:text-2xl">
              {collection.title}
            </h2>
          </article>
        ))}
      </section>

      <section
        className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-20 md:flex-row md:items-end md:justify-between md:px-10 md:py-28"
        id="about"
      >
        <div>
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-leaf">
            The Commerce standard
          </p>
          <h2 className="max-w-xl text-3xl leading-tight tracking-[-0.05em] md:text-4xl">
            Useful by design. Considered in every detail.
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-ink/65">
          We believe the best everyday things earn their place. We look for
          honest materials, responsible makers, and timeless utility.
        </p>
      </section>

      <footer
        className="flex flex-col gap-3 border-t border-ink/10 px-6 py-7 text-xs text-ink/55 md:flex-row md:justify-between md:px-10"
        id="collections"
      >
        <span>© {new Date().getFullYear()} Commerce</span>
        <span>Thoughtful goods for everyday life.</span>
      </footer>
    </main>
  );
}
