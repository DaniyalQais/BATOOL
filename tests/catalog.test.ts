import { test } from "node:test";
import assert from "node:assert/strict";
import { products, getProductById } from "../src/features/catalog/model/products.ts";
import { categories, categoryLabels, stitchedCategories } from "../src/features/catalog/model/types.ts";
import { collectionHref, categoryHref, parseStitchedCategory, selectProducts } from "../src/features/catalog/model/catalog.ts";

test("the catalog contains only stitched products and preserves retained product IDs", () => {
  assert.deepEqual(categories, ["Stitched"]);
  assert.deepEqual(categoryLabels, { Stitched: "Stitched" });
  assert.deepEqual(products.map(p => p.id), [0, 2, 3, 8, 7, 11]);
  assert.deepEqual(products.map(p => p.slug), ["gulnaar", "meher", "saba", "noor", "mira", "zeenat"]);
  for (const product of products) {
    assert.equal(product.category, "Stitched");
    assert.match(product.description, /3-piece stitched/);
    assert.doesNotMatch(product.description, /velvet|silk|Stitched Shirt, Trouser & Dupatta/i);
    assert.deepEqual(product.sizes, ["S", "M", "L", "XL"]);
  }
  for (const id of [1, 4, 5, 6, 9, 10]) assert.equal(getProductById(id), undefined);
});

test("default shopping links show all stitched products without a category parameter", () => {
  assert.equal(collectionHref(), "/#collection");
  assert.deepEqual(selectProducts(products, "", "featured"), products);
});

test("each stitched edit has matching products and a shareable collection destination", () => {
  assert.deepEqual(stitchedCategories, ["All 3-Piece", "Daily Pret", "Festive Edit", "Luxury Formals"]);
  const expected = [[0, 2, 3, 8, 7, 11], [0, 3, 8], [2, 11], [7]];
  for (const [index, category] of stitchedCategories.entries()) {
    const url = new URL(collectionHref(category), "https://batool.example");
    assert.equal(url.pathname, "/");
    assert.equal(url.hash, "#collection");
    assert.equal(parseStitchedCategory(url.searchParams.get("category")), category);
    assert.deepEqual(selectProducts(products, "", "featured", category).map(p => p.id), expected[index]);
  }
  assert.equal(parseStitchedCategory(null), "All 3-Piece");
  assert.equal(parseStitchedCategory("Unknown"), "All 3-Piece");
});

test("edit filters compose with search and sorting without leaking other edits", () => {
  assert.deepEqual(selectProducts(products, "sage", "featured", "Daily Pret").map(p => p.slug), ["saba"]);
  assert.deepEqual(selectProducts(products, "", "low", "Daily Pret").map(p => p.slug), ["noor", "saba", "gulnaar"]);
  assert.deepEqual(selectProducts(products, "Gulnaar", "high", "Luxury Formals"), []);
  assert.deepEqual(selectProducts(products, "3-piece festive", "featured", "Festive Edit").map(p => p.slug), ["meher", "zeenat"]);
});

test("changing an edit preserves other parameters, duplicate tracking values and the current anchor", () => {
  const href = categoryHref("https://batool.example/?ref=home&tag=a&tag=b#collection", "Daily Pret");
  const url = new URL(href, "https://batool.example");
  assert.equal(url.searchParams.get("category"), "Daily Pret");
  assert.equal(url.searchParams.get("ref"), "home");
  assert.deepEqual(url.searchParams.getAll("tag"), ["a", "b"]);
  assert.equal(url.hash, "#collection");
  assert.equal(categoryHref(url.href, "All 3-Piece"), "/?ref=home&tag=a&tag=b#collection");
  assert.equal(categoryHref("https://batool.example/?category=Unknown&category=Unknown#collection", "All 3-Piece"), "/#collection");
});

test("each style has a three-piece ready-to-wear badge and real size choices", () => {
  assert.deepEqual(products.map(p => p.tag), ["3-Piece Stitched", "3-Piece Festive", "Signature 3-Piece", "3-Piece Stitched", "3-Piece Formal", "3-Piece Festive"]);
  for (const product of products) {
    assert.ok(stitchedCategories.includes(product.subcategory));
    assert.deepEqual(product.sizes, ["S", "M", "L", "XL"]);
  }
});

test("search recognizes stitched clothing, product names and occasion styles", () => {
  assert.equal(selectProducts(products, "STITCHED", "featured").length, 6);
  assert.equal(selectProducts(products, "3-piece", "featured").length, 6);
  assert.deepEqual(selectProducts(products, "ivory", "featured", "Daily Pret").map(p => p.slug), ["noor"]);
  assert.deepEqual(selectProducts(products, "formalwear", "featured").map(p => p.slug), ["meher", "mira"]);
  assert.deepEqual(selectProducts(products, "Gulnaar", "featured").map(p => p.slug), ["gulnaar"]);
});

test("search is case insensitive, trims whitespace and handles no matches", () => {
  assert.deepEqual(selectProducts(products, " SAGE ", "featured").map(p => p.slug), ["saba"]);
  assert.deepEqual(selectProducts(products, "not-a-style", "featured"), []);
  assert.deepEqual(selectProducts(products, "   ", "featured"), products);
});

test("sorting composes with search without mutating the catalog or product references", () => {
  const low = selectProducts(products, "", "low");
  assert.equal(low[0], products[3]);
  assert.deepEqual(low.map(p => p.price), [6950, 7450, 8950, 10950, 12450, 14950]);
  assert.equal(selectProducts(products, "", "high")[0].slug, "meher");
  assert.deepEqual(selectProducts(products, "formalwear", "low").map(p => p.slug), ["mira", "meher"]);
  assert.deepEqual(products.map(p => p.id), [0, 2, 3, 8, 7, 11]);
});
