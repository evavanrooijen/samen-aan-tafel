const test = require("node:test");
const assert = require("node:assert/strict");
const { createRecipePrompt, mapGeminiError, parseRecipe, validateIngredients } = require("./recipe");

test("validates and trims selected inventory items", () => {
  assert.deepEqual(
    validateIngredients([{ name: "  Tomaat ", quantity: 3, unit: "st" }]),
    [{ name: "Tomaat", quantity: 3, unit: "st" }]
  );
});

test("rejects empty and oversized ingredient selections", () => {
  assert.throws(() => validateIngredients([]), /Selecteer tussen 1 en 20/);
  assert.throws(() => validateIngredients(Array(21).fill({ name: "Ui", quantity: 1, unit: "st" })), /Selecteer tussen 1 en 20/);
});

test("rejects invalid inventory quantities and names", () => {
  assert.throws(() => validateIngredients([{ name: "", quantity: 1, unit: "st" }]), /ongeldige gegevens/);
  assert.throws(() => validateIngredients([{ name: "Ui", quantity: -1, unit: "st" }]), /ongeldige gegevens/);
  assert.throws(() => validateIngredients([{ name: "Ui", quantity: "2", unit: "st" }]), /ongeldige gegevens/);
});

test("builds a prompt from the selected stock", () => {
  assert.match(createRecipePrompt([{ name: "Tomaat", quantity: 3, unit: "st" }]), /Tomaat: 3 st/);
});

test("parses a valid recipe response", () => {
  assert.deepEqual(parseRecipe(JSON.stringify({
    name: "Tomatenrijst",
    ingredients: ["3 tomaten", "200 g rijst"],
    method: "Kook alles.",
    servings: 2
  })), {
    name: "Tomatenrijst",
    ingredients: ["3 tomaten", "200 g rijst"],
    method: "Kook alles.",
    servings: 2
  });
});

test("rejects malformed recipe responses", () => {
  assert.throws(() => parseRecipe("not JSON"), /geen geldig recept/);
  assert.throws(() => parseRecipe(JSON.stringify({ name: "X", ingredients: [], method: "Y", servings: 2 })), /ongeldig formaat/);
});

test("maps Gemini billing and API errors to actionable callable errors", () => {
  assert.equal(mapGeminiError({ status: 402 }).code, "failed-precondition");
  assert.equal(mapGeminiError({ status: 401 }).code, "failed-precondition");
  assert.equal(mapGeminiError({ status: 429 }).code, "resource-exhausted");
  assert.equal(mapGeminiError({ status: 503 }).code, "unavailable");
  assert.equal(mapGeminiError({ status: 400 }).code, "internal");
});
