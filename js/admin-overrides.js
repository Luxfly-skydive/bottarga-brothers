/**
 * admin-overrides.js
 * Fetches content overrides from Cloudflare KV and applies them to the page.
 * Runs on every page load — lightweight, non-blocking.
 */
(function () {
  const WORKER = 'https://bottarga-admin.zoozoomfast.workers.dev/content';

  const SELECTORS = {
    // Products — name, description, price, image
    product_sardinian_gold_name:  '#sardinia .product-name',
    product_sardinian_gold_desc:  '#sardinia .product-desc',
    product_sardinian_gold_price: '#sardinia .product-price',
    product_sardinian_gold_img:   '#sardinia .product-img',

    'product_boutargue-classique_name':  '#france .product-name',
    'product_boutargue-classique_desc':  '#france .product-desc',
    'product_boutargue-classique_price': '#france .product-price',
    'product_boutargue-classique_img':   '#france .product-img',

    'product_boutargue-imperiale_name':  '#imperiale .product-name',
    'product_boutargue-imperiale_desc':  '#imperiale .product-desc',
    'product_boutargue-imperiale_price': '#imperiale .product-price',
    'product_boutargue-imperiale_img':   '#imperiale .product-img',

    'product_greek-avgotaraho_name':  '#greece .product-name',
    'product_greek-avgotaraho_desc':  '#greece .product-desc',
    'product_greek-avgotaraho_price': '#greece .product-price',
    'product_greek-avgotaraho_img':   '#greece .product-img',

    // Page text
    hero_headline: '.hero-title',
    hero_sub:      '.hero-sub',
    about_intro:   '.about-intro',
    contact_email: '.contact-email',
    contact_phone: '.contact-phone',
  };

  fetch(WORKER)
    .then(r => r.json())
    .then(data => {
      if (!data || Object.keys(data).length === 0) return;
      Object.entries(data).forEach(([key, value]) => {
        const selector = SELECTORS[key];
        if (!selector || !value) return;
        const el = document.querySelector(selector);
        if (!el) return;
        if (key.endsWith('_img')) {
          el.src = value;
        } else if (key.endsWith('_price')) {
          el.innerHTML = '<span class="from">From</span>' + value;
        } else {
          el.textContent = value;
        }
      });
    })
    .catch(() => {}); // fail silently — never break the site
})();
