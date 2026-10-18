const MAX_INGREDIENTS = 20;

function validateIngredients(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_INGREDIENTS) {
    throw new Error(`Selecteer tussen 1 en ${MAX_INGREDIENTS} voorraadproducten.`);
  }

  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Een geselecteerd voorraadproduct is ongeldig.");
    }

    const name = typeof item.name === "string" ? item.name.trim() : "";
    const unit = typeof item.unit === "string" ? item.unit.trim() : "";
    const quantity = item.quantity;
    if (!name || name.length > 80 || typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0 || !unit || unit.length > 16) {
      throw new Error("Een geselecteerd voorraadproduct bevat ongeldige gegevens.");
    }

    return { name, quantity, unit };
  });
}

function parseRecipe(outputText) {
  let recipe;
  try {
    recipe = JSON.parse(outputText);
  } catch {
    throw new Error("De AI gaf geen geldig recept terug.");
  }

  if (
    !recipe ||
    typeof recipe.name !== "string" ||
    !recipe.name.trim() ||
    recipe.name.length > 100 ||
    !Array.isArray(recipe.ingredients) ||
    recipe.ingredients.length === 0 ||
    recipe.ingredients.length > 30 ||
    !recipe.ingredients.every((ingredient) => typeof ingredient === "string" && ingredient.trim() && ingredient.length <= 120) ||
    typeof recipe.method !== "string" ||
    !recipe.method.trim() ||
    recipe.method.length > 5000 ||
    !Number.isInteger(recipe.servings) ||
    recipe.servings < 1 ||
    recipe.servings > 20
  ) {
    throw new Error("De AI gaf een recept terug met een ongeldig formaat.");
  }

  return {
    name: recipe.name.trim(),
    ingredients: recipe.ingredients.map((ingredient) => ingredient.trim()),
    method: recipe.method.trim(),
    servings: recipe.servings
  };
}

function createRecipePrompt(ingredients) {
  const inventory = ingredients
    .map(({ name, quantity, unit }) => `- ${name}: ${quantity} ${unit}`.trim())
    .join("\n");

  return `Maak precies één eenvoudig, haalbaar recept in het Nederlands voor 2 porties.
Gebruik de geselecteerde voorraadproducten als basis en houd rekening met de beschikbare hoeveelheden.
Je mag gewone extra ingrediënten voorstellen als dat nodig is; vermeld alle benodigde ingrediënten met hoeveelheden, zodat ontbrekende producten later op een boodschappenlijst kunnen komen.
Geef een korte, duidelijke bereidingswijze. Verzin geen allergieën of dieetvoorkeuren.

Geselecteerde voorraad:
${inventory}`;
}

function mapGeminiError(error) {
  const status = Number(error?.status);
  if (status === 402) {
    return {
      code: "failed-precondition",
      message: "Gemini weigert deze aanvraag wegens de factureringsinstellingen. Controleer of de API-key toegang heeft tot de gratis Gemini Flash-Lite-tier."
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "failed-precondition",
      message: "De Gemini API-key is ongeldig of heeft geen toegang tot dit model."
    };
  }
  if (status === 429) {
    return {
      code: "resource-exhausted",
      message: "De gratis Gemini-gebruikslimiet is bereikt. Probeer het later opnieuw."
    };
  }
  if (status >= 500) {
    return {
      code: "unavailable",
      message: "De Gemini-service is tijdelijk niet bereikbaar."
    };
  }
  return {
    code: "internal",
    message: "Gemini kon geen recept maken. Probeer het opnieuw."
  };
}

module.exports = { createRecipePrompt, mapGeminiError, parseRecipe, validateIngredients };
