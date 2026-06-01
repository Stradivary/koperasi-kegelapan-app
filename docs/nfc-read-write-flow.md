# NFC Read & Write Operation Diagrams

## 1. Architecture Layers

```mermaid
graph TD
    UI["UI / Component Layer\nUnifiedNfcScanner · TerminalSection · KioskSection · AdminSection"]
    HOOK["Hook Layer\nuseUnifiedNfc · useNfcCard"]
    CORE["Core NFC Layer\nGenericNfcLayer · pipelineEngine · stateMachine · sessionValidator"]
    ADAPTER["Adapter Layer\nWebNfcAdapter"]
    CARD["Physical NFC Card\nNTAG213 / NTAG215 / NTAG216"]

    UI --> HOOK
    HOOK --> CORE
    CORE --> ADAPTER
    ADAPTER <-->|"NDEF read / write"| CARD
```

---

## 2. READ Operation

```mermaid
flowchart TD
    TAP([User taps NFC card]) --> NDEF

    NDEF["NDEFReader 'reading' event\n─────────────────────\nserialNumber · raw NDEF bytes"]

    NDEF --> CLASSIFY

    CLASSIFY{"cardClassifier\n.classify()"}
    CLASSIFY -->|"no records"| EMPTY["❌ empty"]
    CLASSIFY -->|"records, no bytes"| UNKNOWN["❌ unknown"]
    CLASSIFY -->|"magic ≠ 0x4B4F5057"| FOREIGN["❌ foreign"]
    CLASSIFY -->|"magic OK, bad structure"| INVALID["❌ invalid_format"]
    CLASSIFY -->|"magic OK, valid structure"| PIPELINE

    PIPELINE["pipelineEngine\n.readAndValidateCard()"]

    PIPELINE --> DECRYPT
    DECRYPT["① AES-GCM Decrypt body\n─────────────────────\nbytes 16–184\nkey = sessionKey\nnonce = cardId + counter"]

    DECRYPT --> DECODE
    DECODE["② decodePayload()\n─────────────────────\nheader · identity · wallet\nsession · logEntries · trailer"]

    DECODE --> VALIDATE
    VALIDATE["③ validateCard()\n─────────────────────\n① schema version == 4\n② keyVersion match\n③ HMAC verify\n④ counterBind match\n⑤ tenantBind match\n⑥ chain hash valid"]

    VALIDATE -->|"any check fails"| VALERR["❌ error\ntamper=true if HMAC/counter/chain"]
    VALIDATE -->|"all pass"| JOURNAL

    JOURNAL{"Write Journal\nrecovery check?"}
    JOURNAL -->|"counter < expected\n→ write didn't land"| RECOVER["🔄 Trigger recovery write"]
    JOURNAL -->|"counter OK\n→ write landed, record failed"| CLEARJ["Clear journal\nre-record transaction"]
    JOURNAL -->|"no journal"| READY

    RECOVER --> READY
    CLEARJ --> READY

    READY(["✅ State: ready\n─────────────────────\nname · balance · wallet state\ncard status · log entries\nsession info"])
```

---

## 3. WRITE Operation

```mermaid
flowchart TD
    UI([UI triggers operation\ncheck-in · check-out · debit · topup]) --> DOMAIN

    DOMAIN["Domain logic mutates CardPayload\n─────────────────────\napplyCheckout · applyBlockStatus\nupdate balance · counter · logEntries"]

    DOMAIN --> JOURNAL

    JOURNAL["① Save Write-Ahead Journal\n─────────────────────\nsaveWriteJournal → IndexedDB\npreviousPayload · updatedPayload\noperationType · terminalId\n(expires 1h · max 3 retries)"]

    JOURNAL --> PREPARE

    PREPARE["② prepareWrite()\n─────────────────────\n① recompute chain hashes\n② build new trailer\n   rootHash · counterBind · activePtr=0\n③ encode to wire format (280 bytes)\n④ AES-GCM encrypt body (bytes 16–184)\n   nonce = cardId + newCounter\n⑤ compute 8-byte HMAC\n⑥ embed HMAC → signedPayload\n⑦ build final wire bytes"]

    PREPARE --> WRITE

    WRITE["③ NDEFReader.write()\n─────────────────────\n280 bytes · recordType='unknown'\noverwrite=true"]

    WRITE -->|"I/O error (card moved)"| RETRY1["retry once after 200ms"]
    RETRY1 -->|"still fails"| PENDING["⏳ State: write_pending_retry\nstore pendingWrite\n30-second timeout\nwait for re-tap"]
    PENDING -->|"user taps again"| WRITE
    RETRY1 -->|"success"| VERIFY
    WRITE -->|"success"| VERIFY

    VERIFY["④ verifyWrittenPayload()\n─────────────────────\nnew NDEFReader reads card back\ndecrypt + decode\nconstant-time byte comparison\nretry once after 300ms\ntimeout: 2500ms"]

    VERIFY -->|"mismatch"| VFAIL["❌ error: WRITE_VERIFICATION_FAILED\njournal kept for recovery\nuser can press 'Coba Lagi'"]
    VERIFY -->|"match"| RECORD

    RECORD["⑤ recordCardWrite()\n─────────────────────\n① reconciliationOutbox.add()\n   → IndexedDB queue for server sync\n   idempotencyKey: tenantId+cardId+counter\n② recordTransaction()\n   → transaction log (best-effort)\n③ updateLocalCardRecord()\n④ updateLocalUserFromCard()"]

    RECORD --> CLEARJ

    CLEARJ["⑥ clearWriteJournal()\n─────────────────────\nremove IndexedDB entry\nwrite fully confirmed"]

    CLEARJ --> SUCCESS

    SUCCESS(["✅ State: success\nUI shows feedback\nauto-reset to idle after 5s"])
```

---

## 4. State Machine

```mermaid
stateDiagram-v2
    [*] --> idle

    idle --> scanning : START_SCAN

    scanning --> classifying : RAW_SCAN_COMPLETE
    scanning --> error : ERROR

    classifying --> validating : CLASSIFICATION_COMPLETE\n(valid_payload)
    classifying --> ready : CLASSIFICATION_COMPLETE\n(other)
    classifying --> error : ERROR

    validating --> ready : VALIDATION_COMPLETE
    validating --> error : ERROR (tamper detected)

    ready --> writing : START_WRITE
    ready --> idle : RESET

    writing --> success : WRITE_COMPLETE
    writing --> write_pending_retry : WRITE_PENDING_RETRY
    writing --> error : ERROR

    write_pending_retry --> writing : START_WRITE (re-tap)
    write_pending_retry --> idle : CANCEL / RESET

    success --> idle : RESET
    error --> idle : RESET
    error --> scanning : START_SCAN

    scanning --> idle : CANCEL
    classifying --> idle : CANCEL
    validating --> idle : CANCEL
    writing --> idle : CANCEL
```

---

## 5. Card Wire Format (280 bytes)

```mermaid
block-beta
    columns 1

    block:BUFFER["Buffer — 216 bytes"]:1
        A["bytes 0–15\nHeader (16 bytes)\nmagic · version · type · cardId · tenantBind\n🔓 plaintext"]
        B["bytes 16–183\nIdentity + Wallet + Session + LogEntries (168 bytes)\n🔒 AES-GCM encrypted"]
        C["bytes 184–199\nAES-GCM Auth Tag (16 bytes)\n🔒 auth tag"]
        D["bytes 200–215\nReserved (16 bytes)"]
    end

    block:TRAILER["Trailer — 64 bytes"]:1
        E["bytes 216–219\nexpiresAt (4 bytes)\n🔓 plaintext"]
        F["bytes 220\nkeyVersion (1 byte)\n🔓 plaintext"]
        G["bytes 224–229\nrootHash (6 bytes)\n🔓 plaintext"]
        H["bytes 232–235\ncounterBind (4 bytes)\n🔓 plaintext"]
        I["bytes 236–243\nHMAC (8 bytes)\n🔓 plaintext"]
        J["bytes 244\nactivePtr (1 byte)\n🔓 plaintext"]
    end
```

---

## 6. Security Chain

```mermaid
flowchart LR
    AES["🔒 AES-GCM Encryption\n─────────────────\nProtects: identity · wallet\nsession · log entries\nKey: sessionKey\nNonce: cardId + counter"]

    HMAC["🔏 HMAC-SHA256 (8 bytes)\n─────────────────\nCovers: encrypted buffer\n+ trailer\nDetects: any tampering"]

    CTR["🔢 Counter Binding\n─────────────────\nwallet.counter & 0xFFFFFFFF\n== trailer.counterBind\nPrevents: replay attacks"]

    CHAIN["⛓ Chain Hash\n─────────────────\nEach log entry hashes\nthe previous (SHA-256/4)\nDetects: log tampering"]

    TENANT["🏢 Tenant Binding\n─────────────────\nheader.tenantBind\n= FNV-32a(tenantId)\nPrevents: cross-tenant use"]

    VERIFY["✅ Write Verification\n─────────────────\nRead-back after every write\nConstant-time comparison\nPrevents: silent failures"]

    JOURNAL["📓 Write-Ahead Journal\n─────────────────\nIndexedDB before write\nAuto-recovery on next tap\nPrevents: lost transactions"]

    AES --> HMAC --> CTR --> CHAIN --> TENANT --> VERIFY --> JOURNAL
```

---

## 7. Offline / Online Behavior

```mermaid
flowchart TD
    TAP([Card tapped]) --> CHECK{Online?}

    CHECK -->|"Online"| ONLINE["Full server validation\n─────────────────────\nvalidateCard API call\n+ tenant bind check\n+ tamper detection"]

    CHECK -->|"Offline"| OFFLINE["Offline path\n─────────────────────\ntenant bind check only\n(FNV-32a comparison)\nno server HMAC re-verify"]

    OFFLINE --> LENIENT{Lenient mode?}
    LENIENT -->|"yes + tenant mismatch"| WARN["⚠️ ready with warning"]
    LENIENT -->|"no + tenant mismatch"| ERR["❌ error"]
    LENIENT -->|"tenant OK"| READY2["✅ ready"]

    ONLINE --> READY2

    READY2 --> WRITE2["Write still works offline\n─────────────────────\nprepareWrite() — local crypto\nNDEFReader.write() — local\nrecordCardWrite() → outbox queue"]

    WRITE2 --> SYNC["Reconciliation outbox\nsyncs to server\nwhen back online"]
```
