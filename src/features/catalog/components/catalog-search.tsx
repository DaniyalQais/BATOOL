"use client";
import styles from "./product-catalog.module.css";

export function CatalogSearch({ query, onQueryChange }: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <details className={styles.searchPanel}>
      <summary id="catalog-search">Search collection{query ? `: ${query}` : ""}</summary>
      <label htmlFor="clothing-search">Find a stitched style or colour</label>
      <input id="clothing-search" type="search" value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search the collection…" />
    </details>
  );
}
