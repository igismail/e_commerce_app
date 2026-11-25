export default function Loading() {
  return (
    <main aria-label="Loading storefront" className="content-width page-content">
      <div className="loading-bar loading-title" />
      <div className="product-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="loading-product" key={index}>
            <div className="loading-bar loading-image" />
            <div className="loading-bar loading-copy" />
            <div className="loading-bar loading-copy short" />
          </div>
        ))}
      </div>
    </main>
  );
}
