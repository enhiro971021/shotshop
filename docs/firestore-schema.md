# Firestore Schema & Rules (Draft)

## Collections Overview

### `shops`
- **Document ID:** LINE Login `userId`
- **Fields:**
  - `ownerUserId` (string)
  - `shopId` (string, same as doc id for now)
  - `name` (string)
  - `purchaseMessage` (string)
  - `status` (string; `preparing` | `open`)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
  - `isArchived` (boolean, default false)

### `products`
- **Document ID:** generated UUID (e.g. `prod_xxx`)
- **Fields:**
  - `shopId` (string)
  - `name` (string)
  - `description` (string)
  - `price` (number, tax-included JPY)
  - `imageUrl` (string)
  - `inventory` (number)
  - `questionEnabled` (boolean)
  - `questionText` (string)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
  - `isArchived` (boolean)

### `orders`
- **Document ID:** generated (`ord_xxx`)
- **Fields:**
  - `shopId` (string)
  - `productId` (string)
  - `productName` (string snapshot)
  - `unitPrice` (number)
  - `quantity` (number)
  - `status` (string; `pending` | `accepted` | `canceled`)
  - `buyerUserId` (string, raw line user id)
  - `buyerDisplayId` (string hashed/truncated)
  - `questionResponse` (string)
  - `memo` (string)
  - `closed` (boolean)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
  - `acceptedAt` (timestamp)
  - `canceledAt` (timestamp)

### `notifications`
- TODO definition

