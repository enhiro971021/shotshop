# Firestore Schema & Index Plan

## Collections

### `shops`
- **Document ID**: `LINE userId` (shop owner)
- **Fields**
  - `ownerUserId` (string) — same as doc ID
  - `shopId` (string)
  - `name` (string)
  - `purchaseMessage` (string)
  - `status` (`preparing` | `open`)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
  - `contactPendingOrderId` (string | null)

### `products`
- **Document ID**: generated (`prod_xxx`)
- **Fields**
  - `shopId` (string)
  - `name` (string)
  - `description` (string)
  - `price` (number, tax-included JPY)
  - `inventory` (number)
  - `imageUrl` (string)
  - `questionEnabled` (boolean)
  - `questionText` (string)
  - `isArchived` (boolean)
  - `createdAt` / `updatedAt` (timestamp)

### `orders`
- **Document ID**: generated (`ord_xxx`)
- **Fields**
  - `shopId` (string)
  - `buyerUserId` (string, raw LINE userId)
  - `buyerDisplayId` (string, hashed for UI)
  - `status` (`pending` | `accepted` | `canceled`)
  - `items` (array of `{productId, name, unitPrice, quantity}` snapshots)
  - `total` (number)
  - `questionResponse` (string | null)
  - `memo` (string)
  - `closed` (boolean)
  - `contactPending` (boolean)
  - `createdAt` / `updatedAt` (timestamp)
  - `acceptedAt` / `canceledAt` (timestamp)

### `buyerSessions`
- **Document ID**: `buyerUserId`（Messaging API の `source.userId`）
- **Fields**
  - `buyerUserId` (string)
  - `state` (`idle` | `choosingProduct` | `choosingQuantity` | `answeringQuestion` | `confirming`)
  - `shopId` (string)
  - `productId` (string)
  - `quantity` (number)
  - `questionResponse` (string | null)
  - `updatedAt` (timestamp)

## Recommended Indexes

Create the following composite indexes from the Firebase console.

| Collection | Fields |
| --- | --- |
| `orders` | `shopId` ASC, `createdAt` DESC |
| `orders` | `buyerUserId` ASC, `createdAt` DESC |
| `products` | *(none – filtering handled in application layer)* |

## Security Rule Outline

Back-end API uses the Admin SDK, so Firestore rules can be locked down to prevent direct client writes. Suggested rules:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /shops/{shopId} {
      allow read: if resource.data.status == 'open';
      allow write: if false; // only via server
    }

    match /products/{productId} {
      allow read: if get(/databases/$(database)/documents/shops/$(request.resource.data.shopId)).data.status == 'open';
      allow write: if false;
    }

    match /orders/{orderId} {
      allow read, write: if false; // all handled server-side
    }
  }
}
```

If client-side Firestore access is required (e.g. using the SDK directly), rules must be expanded with authenticated checks ensuring `request.auth.uid == shopId` for owner operations and read-only fallbacks for buyers.
