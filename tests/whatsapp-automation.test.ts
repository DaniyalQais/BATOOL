import test from "node:test";
import assert from "node:assert/strict";
import {
  formatWhatsAppPhone,
  buildTcsSlipMessage,
  buildCustomerThankYouMessage,
  getStoreOwnerWhatsAppUrl,
  getCustomerWhatsAppUrl,
  STORE_OWNER_WHATSAPP,
} from "../src/features/cart/model/whatsapp.ts";

test("formatWhatsAppPhone normalizes Pakistani numbers to E.164 without plus", () => {
  assert.equal(formatWhatsAppPhone("03424834128"), "923424834128");
  assert.equal(formatWhatsAppPhone("+92 300 8451024"), "923008451024");
  assert.equal(formatWhatsAppPhone("0300-8451024"), "923008451024");
  assert.equal(formatWhatsAppPhone("3001234567"), "923001234567");
  assert.equal(formatWhatsAppPhone(""), "");
});

test("buildTcsSlipMessage creates a clean, well-formatted slip containing all order fields", () => {
  const dummyOrder = {
    orderRef: "BT-200574",
    name: "Daniyal Qais",
    phone: "03424834128",
    city: "Lahore",
    address: "Abdullah Garden Bagh wali pulli, post office batapur",
    notes: "Near Main Gate",
    paymentMethod: "cod" as const,
    items: [{ id: 1, size: "M" as const, quantity: 1 }],
    subtotal: 14950,
  };

  const slip = buildTcsSlipMessage(dummyOrder);

  assert.match(slip, /NEW ORDER - BATOOL ATELIER/);
  assert.match(slip, /ORDER ID:\* BT-200574/);
  assert.match(slip, /Daniyal Qais/);
  assert.match(slip, /03424834128/);
  assert.match(slip, /Lahore/);
  assert.match(slip, /Abdullah Garden/);
  assert.match(slip, /Near Main Gate/);
  assert.match(slip, /Cash on Delivery \(COD\)/);
  assert.match(slip, /TCS Express Courier/);
});

test("URLs generate properly with wa.me domain and encoded text", () => {
  const dummyOrder = {
    orderRef: "BT-999999",
    name: "Ayesha",
    phone: "03001234567",
    city: "Karachi",
    address: "Clifton Block 2",
    paymentMethod: "cod" as const,
    items: [],
    subtotal: 20000,
  };

  const ownerUrl = getStoreOwnerWhatsAppUrl(dummyOrder);
  assert.ok(ownerUrl.startsWith(`https://wa.me/${STORE_OWNER_WHATSAPP}?text=`));

  const customerUrl = getCustomerWhatsAppUrl(dummyOrder);
  assert.ok(customerUrl.startsWith("https://wa.me/923001234567?text="));

  const thankYou = buildCustomerThankYouMessage(dummyOrder);
  assert.match(thankYou, /Salam Ayesha!/);
  assert.match(thankYou, /BT-999999/);
});
