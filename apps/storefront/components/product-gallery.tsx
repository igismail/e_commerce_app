'use client';

import Image from 'next/image';
import { useState } from 'react';
import { type ProductImage } from '@/lib/api';

export function ProductGallery({
  images,
  productName,
}: {
  images: ProductImage[];
  productName: string;
}) {
  const [selected, setSelected] = useState(0);
  const activeImage = images[selected];

  return (
    <div className="product-gallery">
      <div className="product-detail-image">
        {activeImage ? (
          <Image
            alt={activeImage.altText}
            height={1200}
            referrerPolicy="no-referrer"
            sizes="(max-width: 650px) 100vw, 55vw"
            src={activeImage.url}
            unoptimized
            width={1000}
          />
        ) : (
          <span className="image-placeholder">{productName}</span>
        )}
      </div>
      {images.length > 1 ? (
        <div aria-label={`${productName} images`} className="gallery-thumbnails">
          {images.map((image, index) => (
            <button
              aria-current={selected === index ? 'true' : undefined}
              aria-label={`Show image ${index + 1} of ${images.length}`}
              className={selected === index ? 'gallery-thumb selected' : 'gallery-thumb'}
              key={image.id}
              onClick={() => setSelected(index)}
              type="button"
            >
              <Image
                alt=""
                height={120}
                referrerPolicy="no-referrer"
                src={image.url}
                unoptimized
                width={120}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
