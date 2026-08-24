class SourTable {
  // Private fields
  #table;
  #excludedColumns;
  #keysForAttributes;
  #customParseFunctions = {};
  #isEngaged = false;
  constructor(table, excludedColumns = [], keysForAttributes = {}) {
    // Validate inputs
    if (!(table instanceof HTMLElement) || table.tagName !== 'TABLE') {
      throw new Error("SourTable: Invalid table element. Must be a 'table' element.");
    }
    if (!Array.isArray(excludedColumns) || !excludedColumns.every(Number.isInteger)) {
      throw new Error("SourTable: excludedColumns must be an array of integers.");
    }
    if (excludedColumns.some(col => col < 0)) {
      throw new Error("SourTable: excludedColumns cannot contain negative numbers.");
    }
    if (typeof keysForAttributes !== "object" || keysForAttributes === null) {
      throw new Error("SourTable: keysForAttributes must be an object.");
    }

    // Validate keysForAttributes structure
    for (const key in keysForAttributes) {
      if (!key.startsWith('col_') || isNaN(parseInt(key.split('_')[1]))) {
        throw new Error(`SourTable: Invalid key in keysForAttributes. Use 'col_N' format.`);
      }
      if (typeof keysForAttributes[key] !== 'string') {
        throw new Error(`SourTable: Attribute names must be strings.`);
      }
    }

    // Assign to private fields
    this.#table = table;
    this.#excludedColumns = excludedColumns;
    this.#keysForAttributes = keysForAttributes;
  }

  // Public API
  initiate() {
    if (this.#table.classList.contains("sourtable-initiated")) {

      throw new Error("SourTable: This table has already been initialized. Disengage the previous instance of this table before initializing a new one.");
    }
    if (this.#isEngaged) {
      throw new Error("This SourTable instance is already engaged. Disengage it properly before initiating a new instance.");
    }
    this.#isEngaged = true;
    this.#resetIndicatorArrows();
    this.#addListeners();
    this.#addCSS();
    this.#table.classList.add("sourtable-initiated");

  }
  #removeListeners() {
    const headers = this.#table.querySelectorAll(".sourtable-header");
    headers.forEach(th => {
      // Remove using the bound handler reference
      th.removeEventListener("click", this.#boundSortClickHandler);
    });
  }
  disengage() {
    const headerRow = this.#getHeader();
    this.#removeListeners();
    const headers = headerRow.querySelectorAll("th.sourtable-header");

    for (const th of headers) {

      th.classList.remove("sourtable-header");
      if (th.hasAttribute("data-sourtable-order")) th.removeAttribute("data-sourtable-order");
      const arrowsDiv = th.querySelector(".sourtable-arrow-container");
      if (arrowsDiv) arrowsDiv.remove();
    }
    this.#table.classList.remove("sourtable-initiated");
    this.#isEngaged = false;
  }
  #addListeners() {
    const headers = this.#table.querySelectorAll(".sourtable-header");
    if (!headers.length) {
      throw new Error("SourTable: No sortable headers found. Did you call initiate() first?");
    }
    this.#removeListeners();
    headers.forEach(th => {
      th.addEventListener("click", this.#boundSortClickHandler);
    });
  }
  
  #boundSortClickHandler = (event) => {
    this.#sortClickHandler(event)
  }
  #sortClickHandler = (event) => {
    //console.log(event.target)

    const target = event.target.closest(".sourtable-header");
    if (!target) return;

    const colIndex = Number(target.getAttribute("data-sourtable-col-index").split("_")[1]);
    const order = target.getAttribute("data-sourtable-order") || "asc";
    const key = this.#keysForAttributes[`col_${colIndex}`] ? `attr=${this.#keysForAttributes[`col_${colIndex}`]}` : "";
    this.sort(colIndex, order, key)
  }

  sort(colIndex, order, key = "") {
    try {
      const array = [];
      let rows = this.#getBody();
      if (rows.length === 0) {
        console.warn("No rows to sort.");
        return;
      }

      const isKeyAttr = typeof key === 'string' && key !== '' && key.startsWith('attr=');
      let keyAttr = "";
      if (isKeyAttr) {
        keyAttr = key.split('attr=')[1];
        if (!keyAttr) {
          throw new Error("Empty attribute key provided.");
        }
      }

      let rowIndex = 0;
      for (const row of rows) {
        const index = `index_${rowIndex}`;
        row.setAttribute("data-sourtable-row-index", index);

        const tdList = row.querySelectorAll(":scope > td");
        if (colIndex >= tdList.length) {
          throw new Error(`Column index ${colIndex} is out of bounds for row ${rowIndex}.`);
        }

        const relevantTd = tdList[colIndex];

        if (isKeyAttr) {
          const attrVal = relevantTd.getAttribute(keyAttr);
          if (attrVal === null) {
            throw new Error(`Attribute '${keyAttr}' not found in column ${colIndex}, row ${rowIndex}.`);
          }

          let parsed;
          if (this.#customParseFunctions[`col_${colIndex}`]) {
            try {
              parsed = this.#customParseFunctions[`col_${colIndex}`](attrVal);
            } catch (parseError) {
              throw new Error(`Custom parse function for column ${colIndex} failed: ${parseError.message}`);
            }
          } else {
            parsed = this.#parseText(attrVal);
          }
          array.push([index, parsed]);
        } else {
          const text = relevantTd.innerText;
          let parsed;
          if (this.#customParseFunctions[`col_${colIndex}`]) {
            try {
              parsed = this.#customParseFunctions[`col_${colIndex}`](text);
            } catch (parseError) {
              throw new Error(`Custom parse function for column ${colIndex} failed: ${parseError.message}`);
            }
          } else {
            parsed = this.#parseText(text);
          }
          array.push([index, parsed]);
        }
        rowIndex += 1;
      }

      if (array.length === 0) {
        console.warn("No sortable data collected.");
        return;
      }

      const firstValue = array[0][1];
      const isString = typeof firstValue === "string";

      if (order === "asc") {
        array.sort(function (a, b) {
          return isString ? a[1].localeCompare(b[1]) : a[1] - b[1];
        });
      } else {
        array.sort(function (a, b) {
          return isString ? b[1].localeCompare(a[1]) : b[1] - a[1];
        });
      }

      const tbody = this.#table.querySelector(":scope > tbody") || this.#table;
      const last_element = tbody.querySelector(`tr[data-sourtable-row-index="${array[array.length - 1][0]}"]`);
      if (!last_element) {
        throw new Error("Could not find last row element in DOM.");
      }
      tbody.appendChild(last_element);
      array.splice(-1);

      for (const [index] of array) {

        const rowElement = tbody.querySelector(`tr[data-sourtable-row-index="${index}"]`);
        if (!rowElement) {
          console.warn(`Row with index ${index} not found in DOM.`);
          continue;
        }
        tbody.insertBefore(rowElement, last_element);
      }


      const selector = order === "asc" ? "div.sourtable-arrow-up" : "div.sourtable-arrow-down";

      const target = this.#table.querySelector(`th[data-sourtable-col-index="index_${colIndex}"]`);
      if (!target) {
        throw new Error(`Could not find header for column ${colIndex}.`);
      }
      this.#resetIndicatorArrows();
      target.querySelector(selector).classList.add("filled");
      const newOrder = order === "asc" ? "desc" : "asc";
      target.setAttribute("data-sourtable-order", newOrder);

    } catch (error) {
      console.error(`SourTable.sort failed: ${error.message}`);
      throw error;
    }
  }
  addCustomParseFunction(colIndex, parseFunction) {
    if (typeof parseFunction !== 'function') {
      throw new Error("parseFunction must be a function.");
    }
    this.#customParseFunctions[`col_${colIndex}`] = parseFunction;
  }

  static get version() {
    return "1.0.0";
  }

  // Private methods
  #getHeader() {
    const header = this.#table.querySelector("tr");
    if (!header) throw new Error("No header row found.");
    return header;
  }

  #getBody() {
    const rows = this.#table.querySelectorAll(":scope > tbody > tr");
    if (this.#table.querySelector(":scope > thead")) {
      return Array.from(rows);
    } else {
      return rows.length > 1 ? Array.from(rows).slice(1) : [];
    }
  }

  #resetIndicatorArrows() {
    const headerRow = this.#getHeader();
    const headers = headerRow.querySelectorAll(":scope > th");

    headers.forEach((th, index) => {
      if (this.#excludedColumns.includes(index)) return;

      let arrowsDiv = th.querySelector(".sourtable-arrow-container");
      if (!arrowsDiv) {
        th.classList.add("sourtable-header");
        th.setAttribute("data-sourtable-col-index", `index_${index}`);
        arrowsDiv = this.#createElement("div", { class: "sourtable-arrow-container" });
        th.appendChild(arrowsDiv);
      }

      arrowsDiv.innerHTML = `<div class=sourtable-arrow-up><svg height=24 viewBox="0 0 24 24"width=24 xmlns=http://www.w3.org/2000/svg><path d="M18.2 13.3L12 7l-6.2 6.3c-.2.2-.3.5-.3.7s.1.5.3.7s.4.3.7.3h11c.3 0 .5-.1.7-.3s.3-.5.3-.7s-.1-.5-.3-.7"/></svg></div><div class=sourtable-arrow-down><svg height=24 viewBox="0 0 24 24"width=24 xmlns=http://www.w3.org/2000/svg><path d="M5.8 9.7L12 16l6.2-6.3c.2-.2.3-.5.3-.7s-.1-.5-.3-.7s-.4-.3-.7-.3h-11c-.3 0-.5.1-.7.3s-.3.4-.3.7s.1.5.3.7"/></svg></div>`;
      th.setAttribute("data-sourtable-order", "asc");
    });
  }




  #addCSS() {
    if (document.querySelector("style#sourtable-style")) return;

    const style = this.#createElement("style", { id: "sourtable-style" });
    style.textContent = `.sourtable-arrow-container{display:inline-flex;flex-direction:column;margin-left:.3em;vertical-align:middle;height:1em;width:.8em;justify-content:space-between}.sourtable-arrow-down,.sourtable-arrow-up{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}.sourtable-arrow-down svg,.sourtable-arrow-up svg{width:100%;height:100%;fill:currentColor;opacity:.3;max-height:.5em}.sourtable-arrow-down.filled svg,.sourtable-arrow-up.filled svg{opacity:1!important}.sourtable-header{cursor:pointer!important}`;
    document.head.appendChild(style);
  }

  #parseText(text) {
    if (typeof text !== 'string') return text;
    const stripped = text.replace(/[$,£]/g, "").replace(/\s/g, '');
    const float = parseFloat(stripped.endsWith(".") ? stripped.slice(0, -1) : stripped);
    return isNaN(float) ? text : float;
  }

  #createElement(nodeType, attributes = {}) {
    const element = document.createElement(nodeType);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    return element;
  }
  isEngaged() {
    return this.#isEngaged;
  }
}

// Export for CDN
if (typeof window !== 'undefined') {
  window.SourTable = SourTable;
}