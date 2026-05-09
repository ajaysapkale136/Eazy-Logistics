// public/js/bookingCashfree.js
document.addEventListener("DOMContentLoaded", () => {
  const payBtn = document.getElementById("payNowBtn");
  if (!payBtn) return;

  payBtn.addEventListener("click", async () => {
    try {
      const listingId = document.getElementById("listingId")?.value || "";
      const listingTitle = document.getElementById("listingTitle")?.textContent || "";
      const guestName = document.getElementById("guestName")?.value || "";
      const guestEmail = document.getElementById("guestEmail")?.value || "";
      const startDate = document.getElementById("startDate")?.value || "";
      const endDate = document.getElementById("endDate")?.value || "";
      const nights = document.getElementById("nights")?.value || 1;
      const amountPaisa = document.getElementById("amountPaisa")?.value || 10000; // example paise

      // Create order on server
      const res = await fetch("/bookings/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountPaisa,
          customerName: guestName,
          customerEmail: guestEmail,
          listingId,
          listingTitle,
          startDate,
          endDate,
          nights
        })
      });
      const data = await res.json();
      if (!data || !data.cftoken) {
        alert("Payment initialization failed.");
        console.error(data);
        return;
      }

      // Load Cashfree Checkout (ensure you have correct JS from Cashfree docs)
      // Example: https://sdk.cashfree.com/js/ui/1.0.0/cashfree-ui.min.js (check their docs for exact URL)
      // For this template we will use the global `cf_checkout` invocation pattern:
      const cfToken = data.cftoken;
      const orderId = data.order;

      // Build payment options (this snippet must match your Cashfree checkout version)
      const options = {
        token: cfToken,
        orderId: orderId,
        stage: "TEST", // or "PROD"
        amount: (Number(amountPaisa) / 100).toFixed(2),
        // onSuccess/onFailure callbacks depend on the checkout version
        onSuccess: async function (paymentResponse) {
          // Send server the payment response + bookingDetails to verify & save
          const verify = await fetch("/bookings/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paymentResponse,
              bookingDetails: {
                listingId,
                listingTitle,
                listingImage: document.getElementById("listingImage")?.value || "",
                guestName,
                guestEmail,
                startDate,
                endDate,
                nights,
                totalPrice: amountPaisa
              }
            })
          });
          const v = await verify.json();
          if (v && v.success && v.receipt) {
            window.location.href = `/bookings/success?receipt=${v.receipt}`;
          } else {
            alert("Payment verification failed. Check console.");
            console.error(v);
          }
        },
        onFailure: function (err) {
          console.error("Cashfree payment failed", err);
          alert("Payment failed. Try again.");
        }
      };

      // The checkout invocation differs by SDK. If the global function is `cfCheckout`, call that:
      if (window.cfCheckout) {
        window.cfCheckout(options);
      } else {
        // If your Cashfree script uses another method, adapt here.
        console.warn("Cashfree checkout function not found. Add the Cashfree checkout script in your EJS.");
        alert("Payment SDK not loaded. See console.");
      }

    } catch (err) {
      console.error(err);
      alert("Payment error. See console.");
    }
  });
});
