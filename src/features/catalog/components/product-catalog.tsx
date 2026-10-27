"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCard } from "./product-card";
import { CatalogSearch } from "./catalog-search";
import { stitchedCategories, type Product, type SortOrder } from "../model/types";
import { categoryHref, parseStitchedCategory, selectProducts } from "../model/catalog";
import styles from "./product-catalog.module.css";
export function ProductCatalog({ products }: { products: readonly Product[] }) {
  const params = useSearchParams();
  const category = parseStitchedCategory(params.get("category"));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("featured");
  // This small sample catalog needs no extra memoization or client provider.
  const visible = selectProducts(products, query, sort, category);
  return (
    <>
      <div className={styles.categoryFilters} role="group" aria-label="Filter ready-to-wear collection">
        {stitchedCategories.map(value => (
          <button key={value} type="button" aria-pressed={value === category}
            onClick={() => {
              const current = window.location;
              const href = categoryHref(current.href, value);
              if (href !== `${current.pathname}${current.search}${current.hash}`) {
                window.history.pushState(null, "", href);
              }
            }}>
            {value}
          </button>
        ))}
      </div>
      <CatalogSearch query={query} onQueryChange={setQuery} />
      <div className={styles.toolbar}>
        <p className={styles.summary} role="status">{category} <span aria-hidden="true">/</span> {visible.length} {visible.length === 1 ? "ensemble" : "ensembles"}</p>
        <label className={styles.sortLabel}>
          Sort by{" "}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOrder)}
          >
            <option value="featured">Featured</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
          </select>
        </label>
      </div>
      <div className="product-grid">
        {visible.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {!visible.length && (
        <p role="status">No pieces found. Try another search or stitched edit.</p>
      )}
    </>
  );
}

export function CatalogFallback({ products }: { products: readonly Product[] }) {
  return (
    <div className="product-grid" aria-busy="true" aria-label="Loading ready-to-wear collection">
      {products.map(product => <ProductCard key={product.id} product={product} />)}
    </div>
  );
}
