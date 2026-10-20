/* From AppUpload's lib/extract.js (appupload main) — unchanged but for the import path. */
import Anthropic from "@anthropic-ai/sdk";
import { friendlyApiError } from "./apiError.mjs";

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const ownerSchema = {
  type: "object",
  properties: {
    first: { type: "string" },
    last: { type: "string" },
    title: { type: "string", description: "Job title / role, e.g. Owner, President" },
    ownershipPct: { type: "string", description: "Ownership percentage, digits only e.g. 100" },
    homeAddress: { type: "string" },
    city: { type: "string" },
    state: { type: "string" },
    zip: { type: "string" },
    phone: { type: "string" },
    email: { type: "string" },
    ssn: { type: "string", description: "Social Security Number from the handwritten application" },
    dob: { type: "string", description: "Date of birth, MM/DD/YYYY" },
    dlNumber: { type: "string", description: "Driver's license number (from the license image if provided)" },
    dlState: { type: "string", description: "Driver's license issuing state" },
    dlExp: { type: "string", description: "Driver's license expiration date" },
  },
};

export const EXTRACTION_TOOL = {
  name: "merchant_application",
  description: "Structured data extracted from a handwritten merchant processing application and its supporting documents.",
  input_schema: {
    type: "object",
    properties: {
      appType: {
        type: "string",
        enum: ["citizens", "merrick", "fd_north", "pbt", "greenlight", "pathward", "pathward_guide", "unknown"],
        description:
          "Which application template this is. 'citizens' and 'fd_north' share the same Priority 'Merchant Processing Application and Agreement' 3-page layout (numbered sections 1-10) — tell them apart by the member bank in the footer/confirmation page: 'citizens' mentions Citizens Bank, N.A., Providence RI (form code 59495v1 / PPS2301); 'fd_north' mentions Synovus Bank, Columbus GA (form code PRTH0125WP). 'merrick' = 'Merchant Application and Agreement' mentioning Merrick Bank / Woodbury NY. 'pbt' = the 6-page Priority 'Merchant Processing Application and Agreement' (Page 1 of 6, form code PPS0622v3) with the PB&T Bank logo, mentioning The Pueblo Bank and Trust Company / PB&T Bank, Pueblo CO. 'greenlight' = the Greenlight Payments, LLC 'Merchant Application' (green section bars; ISO Office / Sales Agent / Program boxes; SSB Bank as the member bank; version GLP_MPA), usually inside the 11-page 'CBD Merchant Processing Program Packet'. 'pathward' = the 2-page Wholesale Payments 'Merchant Application and Agreement' whose footer reads 'Wholesale Payments inc. is a registered ISO of Pathward, N.A., Sioux Falls, SD' (VERSION 10.8.2026; Merchant # / MCC boxes at the top, a Site Inspection section, four Principal/Owner blocks with Control Prong) — not 'merrick', which names Merrick Bank. 'pathward_guide' = the 44-page Merchant Services 'Program Guide' (form code N_PW_R_2902; Pathward, N.A. as the member bank) when only it is given — its page 2 'Part 1: Confirmation Page' has the client's business legal name and the principal's signature, title, date and printed name; with an application, the application decides. 'unknown' if it cannot be determined.",
      },
      appTypeConfidence: { type: "string", enum: ["high", "medium", "low"] },
      documents: {
        type: "object",
        description: "Which supporting documents were present among the uploaded images.",
        properties: {
          hasVoidedCheck: { type: "boolean" },
          hasDriversLicense: { type: "boolean" },
          pageCount: { type: "integer", description: "Number of application pages detected" },
        },
      },
      business: {
        type: "object",
        properties: {
          dba: { type: "string", description: "Doing-Business-As / merchant trade name" },
          legalName: { type: "string", description: "Corporate / legal name" },
          locationAddress: { type: "string" },
          locationCity: { type: "string" },
          locationState: { type: "string" },
          locationZip: { type: "string" },
          corpAddress: { type: "string" },
          corpCity: { type: "string" },
          corpState: { type: "string" },
          corpZip: { type: "string" },
          phone: { type: "string" },
          fax: { type: "string" },
          contactName: { type: "string" },
          contactPhone: { type: "string" },
          customerServicePhone: { type: "string" },
          email: { type: "string" },
          website: { type: "string" },
          federalTaxId: { type: "string" },
          taxType: { type: "string" },
          taxFilingName: { type: "string" },
          dnb: { type: "string", description: "D&B number" },
          businessType: { type: "string" },
          productsSold: { type: "string" },
          organizationType: {
            type: "string",
            description: "One of: Sole Prop, Partnership, LLC, Corporation, C Corp, S Corp, Non-Profit, Government",
          },
          stateIssued: { type: "string", description: "State where the entity is registered" },
          businessStarted: { type: "string" },
          lengthOwnershipYears: { type: "string" },
          lengthOwnershipMonths: { type: "string" },
        },
      },
      owners: { type: "array", items: ownerSchema, maxItems: 4, description: "The owners / principals / officers in the order listed (up to 4)." },
      banking: {
        type: "object",
        description: "Deposit account. Prefer the voided check image for bankName/routing/account when present.",
        properties: {
          bankName: { type: "string" },
          routing: { type: "string", description: "9-digit ABA routing number (from the check MICR line)" },
          account: { type: "string", description: "Bank account / DDA number (from the check MICR line)" },
          bankPhone: { type: "string" },
          accountType: { type: "string", enum: ["checking", "savings", ""] },
        },
      },
      transaction: {
        type: "object",
        properties: {
          monthlyVolume: { type: "string", description: "Requested monthly card volume, digits" },
          avgTicket: { type: "string" },
          highTicket: { type: "string" },
          amexVolume: { type: "string" },
          swipePct: { type: "string" },
          motoPct: { type: "string" },
          internetPct: { type: "string" },
          salesToConsumerPct: { type: "string" },
          salesToBusinessPct: { type: "string" },
          salesToGovPct: { type: "string" },
          previousProcessor: { type: "string" },
          reasonForLeaving: { type: "string" },
          seasonal: { type: "boolean" },
        },
      },
      fees: {
        type: "object",
        description: "Negotiated fees written on the application (digits/amounts only, no $).",
        properties: {
          authVmcda: { type: "string", description: "Visa/MC/Disc/Amex authorization fee" },
          fleet: { type: "string", description: "Fleet card fee" },
          pinDebit: { type: "string", description: "Pin Debit fee" },
          pinDebitPct: { type: "string", description: "Pin Debit percentage" },
          ebt: { type: "string" },
          salesTxn: { type: "string", description: "Sales transaction fee" },
          monthlyService: { type: "string" },
          monthlyMinimum: { type: "string" },
          wireless: { type: "string", description: "Wireless fee" },
          pinDebitMonthly: { type: "string" },
          industryCompliance: { type: "string" },
          chargeback: { type: "string" },
          retrieval: { type: "string" },
          achReject: { type: "string", description: "ACH reject fee" },
          annual: { type: "string", description: "Annual fee" },
          batch: { type: "string", description: "Batch fee" },
          returnTxn: { type: "string", description: "Return transaction fee" },
          electronicAvs: { type: "string", description: "Electronic AVS fee — Merrick only (preprinted $0.05 on Citizens/FD North; ignore there)" },
          voiceAuth: { type: "string", description: "Voice Authorization fee — Merrick only (preprinted on Citizens/FD North; ignore there)" },
          voiceAvs: { type: "string", description: "Voice AVS fee — Merrick only (preprinted on Citizens/FD North; ignore there)" },
          equipmentRental: { type: "string", description: "Equipment monthly rental" },
          monthToBill: { type: "string", description: "Month to bill (the annual fee billing month)" },
          earlyTermination: { type: "string", description: "Early termination fee (ETF)" },
          basilPos: { type: "string", description: "Merrick only" },
          saasFee: { type: "string", description: "Merrick only" },
          inactivityFee: { type: "string", description: "Merrick only" },
          gatewayMonthly: { type: "string", description: "Merrick only" },
          gatewayTxn: { type: "string", description: "Merrick only" },
          monthlyMisc: { type: "string", description: "Merrick: monthly miscellaneous" },
        },
      },
      serviceAcceptance: {
        type: "object",
        description: "The Service Acceptance & Fee Schedule section of the application.",
        properties: {
          cardVisaCredit: { type: "boolean" },
          cardVisaDebit: { type: "boolean" },
          cardMcCredit: { type: "boolean", description: "Mastercard credit" },
          cardMcDebit: { type: "boolean", description: "Mastercard debit" },
          cardDiscover: { type: "boolean" },
          cardAmex: { type: "boolean", description: "Amex credit / American Express" },
          cardPin: { type: "boolean", description: "Pin credit / pin debit card type" },
          cardEbt: { type: "boolean", description: "EBT card type (Merrick)" },
          discountPlan: { type: "string", enum: ["flat", "passthrough", ""], description: "Which discount rate plan is checked" },
          flatCreditPct: { type: "string", description: "Flat rate credit %, digits only" },
          flatDebitPct: { type: "string" },
          flatAmexPct: { type: "string" },
          passCreditPct: { type: "string", description: "Passthrough IC credit %, digits only" },
          passDebitPct: { type: "string" },
          passAmexPct: { type: "string" },
          assessments: { type: "string", enum: ["included", "billed", ""], description: "Assessments & brand fees" },
          paymentMethod: { type: "string", enum: ["daily", "monthly", ""], description: "Requested discount payment method" },
        },
      },
      equipment: {
        type: "array",
        description: "Equipment listed on the application (terminal/software model + quantity). Up to 3.",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            type: { type: "string", description: "e.g. Terminal, Software, Pin Pad, Gateway" },
            model: { type: "string", description: "Model / name" },
            quantity: { type: "string" },
          },
        },
      },
      signatures: {
        type: "object",
        description: "Printed names, titles and dates handwritten on the signature pages (NOT the signature itself). Leave blank if not filled in.",
        properties: {
          printedName: { type: "string", description: "Printed name of the first principal/signer" },
          title: { type: "string", description: "Title of the first signer" },
          date: { type: "string", description: "Date next to the first signer" },
          printedName2: { type: "string", description: "Printed name of the second signer, if any" },
          title2: { type: "string" },
          date2: { type: "string" },
        },
      },
      coversheet: {
        type: "object",
        description: "Only these set-up details, when the documents show them.",
        properties: {
          fnsNumber: { type: "string", description: "FNS / F&S # (food stamps / EBT merchant number)" },
          cashDiscount: { type: "boolean", description: "The merchant is on a cash discount program" },
          cashDiscountTerminalRate: { type: "string", description: "Cash discount rate %, digits only" },
        },
      },
      greenlight: {
        type: "object",
        description: "What only the Greenlight Payments (CBD) application asks. Fill whatever the documents show, on any form.",
        properties: {
          isoOffice: { type: "string", description: "ISO Office" },
          program: { type: "string", description: "Program (e.g. CBD)" },
          sendMailTo: { type: "string", enum: ["corporate", "dba", ""], description: "Send Mail To: Corporate Address or DBA Address" },
          description: { type: "string", description: "Description of Business" },
          mcc: { type: "string", description: "MCC (merchant category code), digits" },
          fulfillmentCenter: { type: "string" },
          fulfillmentContact: { type: "string", description: "Fulfillment center contact & phone number" },
          bankruptcy: { type: "string", enum: ["yes", "no", ""], description: "Prior business bankruptcy" },
          match: { type: "string", enum: ["yes", "no", ""], description: "Previously placed on MATCH" },
          chargedAt: { type: "string", enum: ["purchase", "shipment", ""], description: "Cardholder is charged at time of purchase or shipment" },
          refundPolicy: { type: "string" },
          daysToDelivery: { type: "string" },
          depositRequired: { type: "string", enum: ["yes", "no", ""] },
          depositPct: { type: "string", description: "Deposit % of total purchase price, digits" },
          mktSocial: { type: "boolean", description: "Method of marketing: social media" },
          mktSms: { type: "boolean", description: "SMS text" },
          mktEmail: { type: "boolean", description: "Email" },
          mktAffiliate: { type: "boolean", description: "Affiliate" },
          mktOnlineAds: { type: "boolean", description: "Online ads" },
          mktDirectMail: { type: "boolean", description: "Direct mail (brochure / catalog)" },
          mktRadioTv: { type: "boolean", description: "Radio / TV" },
          mtCashDiscount: { type: "boolean", description: "Merchant type: cash discount" },
          mtRetail: { type: "boolean", description: "Merchant type: retail" },
          mtEcommerce: { type: "boolean", description: "Merchant type: ecommerce" },
          mtMoto: { type: "boolean", description: "Merchant type: MO/TO" },
          cdSwipe: { type: "string", description: "Cash discount row: swipe %" },
          cdKeyed: { type: "string", description: "Cash discount row: keyed %" },
          retailSwipe: { type: "string", description: "Retail row: swipe %" },
          retailKeyed: { type: "string", description: "Retail row: keyed %" },
          ecomInternet: { type: "string", description: "Ecommerce row: internet %" },
          ecomPhone: { type: "string", description: "Ecommerce row: phone %" },
          motoMail: { type: "string", description: "MO/TO row: mail %" },
          motoPhone: { type: "string", description: "MO/TO row: phone %" },
          amexSe: { type: "string", description: "American Express Direct SE #" },
          eqPos: { type: "boolean", description: "Equipment: POS terminal" },
          eqManufacturer: { type: "string" },
          eqModel: { type: "string" },
          eqGateway: { type: "boolean" },
          gatewayProvider: { type: "string" },
          eqVirtual: { type: "boolean", description: "Virtual terminal" },
          virtualProvider: { type: "string" },
          eqSoftware: { type: "boolean" },
          softwareProvider: { type: "string" },
          crm: { type: "string", enum: ["yes", "no", ""], description: "Do you use a CRM?" },
          crmName: { type: "string" },
          qualPerItem: { type: "string", description: "Qual rate per item $" },
          qualRate: { type: "string", description: "Qual rate %" },
          midQualRate: { type: "string", description: "Mid-qual + %" },
          nonQualRate: { type: "string", description: "Non-qual + %" },
          underwritingFee: { type: "string", description: "GLP underwriting fee" },
          riskMonitoringFee: { type: "string" },
          merlinkFee: { type: "string", description: "MERLINK fee" },
          docApplication: { type: "boolean", description: "Document checklist: completed merchant application" },
          docVoidedCheck: { type: "boolean", description: "Voided business check / bank letter" },
          docArticles: { type: "boolean", description: "Articles of incorporation / operating agreement" },
          docBankExisting: { type: "boolean", description: "(Existing business) 3 months company bank statements" },
          docBankNew: { type: "boolean", description: "(New business) 3 months personal bank statements" },
          docProcessing: { type: "boolean", description: "3 months processing statements" },
          docLicense: { type: "boolean", description: "Driver license for all owners" },
          docDomain: { type: "boolean", description: "Proof of domain ownership" },
          docWebsite: { type: "boolean", description: "Website lists privacy, refund and terms links" },
          docProducts: { type: "boolean", description: "Export of all products sold" },
          docCoa: { type: "boolean", description: "COA for every product" },
          docDropShip: { type: "boolean", description: "Drop shipping / fulfillment agreement" },
          docAffiliate: { type: "boolean", description: "Affiliate programs" },
          freeTrial: { type: "string", enum: ["yes", "no", ""], description: "Offering free trial or sample products" },
        },
      },
      pathward: {
        type: "object",
        description: "What only the Pathward 'Merchant Application and Agreement' asks. Fill whatever the documents show, on any form.",
        properties: {
          merchantNumber: { type: "string", description: "Merchant # (top of the form)" },
          tinType: { type: "string", enum: ["ein", "ssn", ""], description: "TIN type checked" },
          optIn: { type: "string", enum: ["in", "out", ""], description: "Marketing calls/texts: OPT IN or OPT OUT checked" },
          acceptsCards: { type: "string", enum: ["yes", "no", ""], description: "Does this location currently accept payment cards?" },
          mJan: { type: "boolean", description: "Seasonal high-volume / active month checked (the Citizens, FD North, Merrick and Pathward forms' month boxes): January" }, mFeb: { type: "boolean" }, mMar: { type: "boolean" }, mApr: { type: "boolean" },
          mMay: { type: "boolean" }, mJun: { type: "boolean" }, mJul: { type: "boolean" }, mAug: { type: "boolean" }, mSep: { type: "boolean" }, mOct: { type: "boolean" },
          mNov: { type: "boolean" }, mDec: { type: "boolean" },
          siteLocation: { type: "string", enum: ["apartment", "home", "isolated", "mall", "office", "shopping", "other", ""], description: "Site inspection: location" },
          siteLocationOther: { type: "string" },
          zone: { type: "string", enum: ["business", "industrial", "residential", ""] },
          nameStoreFront: { type: "boolean", description: "Name displayed: store front" }, nameDoor: { type: "boolean" }, nameWindow: { type: "boolean" },
          sqFootage: { type: "string", enum: ["0-250", "251-500", "501-2000", "2000+", ""] },
          licenseVisible: { type: "string", enum: ["yes", "no", ""], description: "Proper license visible (liquor, tax ID, etc.)" },
          floors: { type: "string", enum: ["1", "2-4", "5-10", "11+", ""], description: "Number of floors" },
          occupies: { type: "string", enum: ["ground", "other", ""], description: "Merchant occupies: ground floor or other" },
          occupiesOther: { type: "string" },
          remainingFloors: { type: "string", enum: ["residential", "commercial", "combination", ""] },
          employees: { type: "string", description: "Number of employees" },
          registers: { type: "string", description: "Number of registers / terminals" },
          fulfillment: { type: "string", enum: ["direct", "vendor", "other", ""], description: "Who performs product/service fulfillment" },
          vendorName: { type: "string" }, vendorPhone: { type: "string" }, vendorAddress: { type: "string" }, vendorCity: { type: "string" }, vendorState: { type: "string" }, vendorZip: { type: "string" },
          cardFleet: { type: "boolean", description: "Requested card type: FLEET" },
          pinPlan: { type: "string", enum: ["passthrough", "flat", ""], description: "If PIN debit: Passthrough IC or Flat Rate" },
          pinPlanPct: { type: "string", description: "If PIN debit: the %, digits" },
          servicePlan: { type: "string", enum: ["core", "growth", ""] },
          eq1Type: { type: "string", enum: ["terminal", "pinpad", "var", "gateway", ""], description: "Equipment row 1 type (its model and quantity go in equipment)" },
          eq1Make: { type: "string", description: "Equipment row 1 manufacturer" },
          eq1Deploy: { type: "string", enum: ["new", "existing", ""] },
          eq1Conn: { type: "string", enum: ["dial", "ethernet", "wireless", ""] },
          eq2Type: { type: "string", enum: ["terminal", "pinpad", "var", "gateway", ""] }, eq2Make: { type: "string" },
          eq2Deploy: { type: "string", enum: ["new", "existing", ""] }, eq2Conn: { type: "string", enum: ["dial", "ethernet", "wireless", ""] },
          eq3Type: { type: "string", enum: ["terminal", "pinpad", "var", "gateway", ""] }, eq3Make: { type: "string" },
          eq3Deploy: { type: "string", enum: ["new", "existing", ""] }, eq3Conn: { type: "string", enum: ["dial", "ethernet", "wireless", ""] },
          payAppName: { type: "string", description: "If software: payment application name" },
          payAppVersion: { type: "string", description: "If software: version in use" },
          tpp: { type: "string", enum: ["yes", "no", ""], description: "Uses a third-party provider (TPP) to store, process or transmit cardholder data" },
          tppName: { type: "string" }, tppAddress: { type: "string" }, tppPhone: { type: "string" }, tppEmail: { type: "string" },
          cp1: { type: "string", enum: ["yes", "no", ""], description: "Principal 1 control prong" },
          cp2: { type: "string", enum: ["yes", "no", ""] }, cp3: { type: "string", enum: ["yes", "no", ""] }, cp4: { type: "string", enum: ["yes", "no", ""] },
        },
      },
      sales: {
        type: "object",
        properties: {
          salesRep: { type: "string" },
          salesOffice: { type: "string" },
          salesAgentName: { type: "string" },
        },
      },
      notes: { type: "string", description: "Anything written that doesn't fit a field, or legibility caveats." },
    },
    required: ["appType", "business", "owners", "banking"],
  },
};

const SYSTEM_PROMPT = `You are an expert at reading photographs of handwritten merchant payment-processing \
applications and the supporting documents that accompany them (a voided check and one or more driver's \
licenses). You convert what is handwritten/printed into accurate structured data.

You will receive several images. They may include:
- one or more pages of a handwritten merchant application (the Citizens/Priority form, the FD North/Synovus form — same Priority layout, Synovus Bank in the footer — the Merrick form, the 6-page PB&T Bank/Priority form from Pueblo CO, the Greenlight Payments CBD merchant application, or the 2-page Wholesale Payments / Pathward 'Merchant Application and Agreement'),
- the Confirmation Page (page 2) of the Pathward Merchant Services 'Program Guide' (N_PW_R_2902),
- a voided check,
- a driver's license for one or more of the owners.

Rules for filling the structured data:
1. Detect which application template it is (appType) from its title, bank name, and layout.
2. Read EVERY handwritten value carefully. Transcribe exactly what is written; do not invent values.
   If a field is blank or unreadable, leave it as an empty string.
3. SOURCING — use the most authoritative source for each field:
   - Owner identity (first/last name, home address, city/state/zip, date of birth, driver's license number,
     license state, license expiration): take from the DRIVER'S LICENSE image when one is provided, matching
     the license to the correct owner by name. Take SSN, title, ownership %, phone and email from the application.
   - Banking (bank name, routing number, account number): take from the VOIDED CHECK when provided. The routing
     number is the 9 digits in the MICR line; the account number follows it. Otherwise use the application.
   - All other fields: from the handwritten application.
4. Normalize: amounts/percentages as digits only (no $ or %). Dates as written.
5. Set documents.hasVoidedCheck / documents.hasDriversLicense based on what you actually saw.
6. FEES: read the "Service Acceptance and Fee Schedule" and "Authorization, Monthly & Miscellaneous Fees"
   sections and fill every fee that has a handwritten amount. On the Citizens/FD North forms, ignore preprinted
   amounts (e.g. Electronic AVS $0.05, Batch Fee $0.20, Voice Auth $1.00) unless the agent wrote a different
   value; on the Merrick form those cells are blank, so capture handwritten Electronic AVS / Voice Authorization /
   Voice AVS / Batch / Return Transaction amounts when present.
   On the CITIZENS, FD NORTH and MERRICK forms, Seasonal Merchant Y / N -> transaction.seasonal, and each high
   volume / active month checked -> pathward.mJan..mDec.
7. SERVICE ACCEPTANCE: set the card-type booleans for each box that is checked, the discount plan (flat or
   passthrough) and its credit/debit/amex percentages, the assessments option, and the payment method.
8. EQUIPMENT: list each terminal/software/equipment line with its model and quantity.
9. SIGNATURES: if the signature pages have handwritten PRINTED names, titles or dates, capture them; never
   transcribe the cursive signature itself. Leave blank if the pages are unsigned.
10. ENTER EACH VALUE ONCE, where every form shares it: the business, owners, banking, volumes, fees, card
   types, equipment and signers go in their shared sections; the greenlight and pathward objects only hold
   what no other section has. List up to 4 owners / principals in order. On the GREENLIGHT application: Legal Name
   and Legal Address -> business.legalName and corp address; DBA Address -> location address; Entity Type ->
   organizationType; EIN -> federalTaxId; Entity Start Date -> businessStarted; Products / Services Sold ->
   productsSold; Previous Processor(s) -> transaction.previousProcessor; Sales Agent -> sales.salesAgentName;
   Principal / Officer blocks -> owners; settlement bank (and checking / savings) -> banking; processing
   volumes -> transaction; Business Type B2C / B2B % -> salesToConsumerPct / salesToBusinessPct; the
   merchant-type swipe % -> transaction.swipePct, internet % -> internetPct, MO/TO mail + phone % ->
   motoPct (and each row's % in greenlight too); requested services -> serviceAcceptance card types
   (Visa / MasterCard -> all four Visa / MC types; Amex Opt Blue or Direct -> cardAmex); Food Stamps F&S# ->
   coversheet.fnsNumber; the Cash Discount rate -> coversheet.cashDiscount + cashDiscountTerminalRate;
   Flat Rate % -> serviceAcceptance.flatCreditPct (discountPlan flat), Interchange Plus % -> passCreditPct
   (passthrough), the chosen plan's per item -> fees.salesTxn; PIN Debit per item / % -> fees.pinDebit /
   pinDebitPct; Authorizations -> authVmcda; Batch -> batch; AVS -> electronicAvs; EBT -> ebt; Annual Fee
   and its month -> annual / monthToBill; Monthly Service Fee -> monthlyService; Compliance Fee ->
   industryCompliance; Monthly Minimum -> monthlyMinimum; Early Termination Fee -> earlyTermination; the
   Principal / Officer signature rows -> signatures. Ignore the preprinted amounts (PCI, chargeback,
   retrieval, ACH return, DDA change). On any other document, still fill the greenlight fields it shows
   (e.g. an MCC, a refund policy, a fulfillment center).
11. On the PATHWARD application (same layout as Merrick's, plus more): Merchant Name -> business.dba;
   Corporate / Legal Name -> legalName; Business Start Date -> businessStarted; Type of Business ->
   organizationType; State Issued -> stateIssued; MCC -> greenlight.mcc; Monthly MC / Visa / Discover Volume ->
   transaction.monthlyVolume; Current Processor -> previousProcessor; Do you currently take deposits? ->
   greenlight.depositRequired; Days to Delivery -> greenlight.daysToDelivery; Seasonal Merchant Yes ->
   transaction.seasonal (and each checked month -> pathward.mJan..mDec, as on the Citizens / FD North / Merrick month rows); Sales Agent Name -> sales.salesAgentName;
   the Debit / Credit / American Express % -> the chosen plan's serviceAcceptance flat* or pass* percentages;
   the Principal/Owner blocks -> owners (up to 4); each equipment row's model / version and quantity ->
   equipment, its type, manufacturer, deployment and connection -> pathward eqN*; the Principal #1-#2
   print name / title / date rows -> signatures. Everything else only this form asks goes in pathward.
12. On the Pathward PROGRAM GUIDE's Confirmation Page: Print Client's Business Legal Name ->
   business.legalName; Please Print Name of Signer / Title / Date -> signatures.printedName / title / date.

Return your result ONLY by calling the merchant_application tool.`;

export async function extractFromImages(images, opts = {}) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error("No images provided.");
  }

  if (process.env.TRANSCRIBE_MOCK === "1") {
    return normalizeRecord(mockRecord());
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment (see .env.example) to enable extraction."
    );
    err.statusCode = 503;
    throw err;
  }

  const client = new Anthropic({ apiKey: apiKey.trim() });
  const model = opts.model || DEFAULT_MODEL;

  const content = [];
  images.forEach((img, i) => {
    if (img.mediaType === "application/pdf") {
      // Claude reads PDFs natively (typed text + scanned pages) — no rendering needed.
      content.push({ type: "text", text: `File ${i + 1} (PDF):` });
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: img.data } });
    } else if (ALLOWED_MEDIA.has(img.mediaType)) {
      content.push({ type: "text", text: `Image ${i + 1}:` });
      content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
    } else {
      const err = new Error(`Unsupported file type: ${img.mediaType}`);
      err.statusCode = 415;
      throw err;
    }
  });
  content.push({
    type: "text",
    text: "Extract the merchant application data from the files above by calling the merchant_application tool.",
  });

  let message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: 8192, // room for every form's fields (the Greenlight ones too)
      system: SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    throw friendlyApiError(e);
  }

  const toolUse = message.content.find((b) => b.type === "tool_use" && b.name === EXTRACTION_TOOL.name);
  if (!toolUse) throw new Error("The model did not return structured data.");
  return normalizeRecord(toolUse.input);
}

/** Ensure the record has every section/field so downstream code can rely on the shape. */
export function normalizeRecord(raw = {}) {
  const r = raw || {};
  const owners = Array.isArray(r.owners) ? r.owners : [];
  const out = {
    appType: ["citizens", "merrick", "fd_north", "pbt", "greenlight", "pathward", "pathward_guide"].includes(r.appType) ? r.appType : "unknown",
    appTypeConfidence: r.appTypeConfidence || "low",
    documents: {
      hasVoidedCheck: Boolean(r.documents?.hasVoidedCheck),
      hasDriversLicense: Boolean(r.documents?.hasDriversLicense),
      pageCount: r.documents?.pageCount || 0,
    },
    business: { ...emptyBusiness(), ...(r.business || {}) },
    owners: [0, 1].map((i) => ({ ...emptyOwner(), ...(owners[i] || {}) })),
    banking: { ...emptyBanking(), ...(r.banking || {}) },
    transaction: { ...emptyTransaction(), ...(r.transaction || {}) },
    fees: { ...emptyFees(), ...(r.fees || {}) },
    serviceAcceptance: { ...emptyServiceAcceptance(), ...(r.serviceAcceptance || {}) },
    signatures: { ...emptySignatures(), ...(r.signatures || {}) },
    equipment: [0, 1, 2, 3].map((i) => ({ ...emptyEquip(), ...((Array.isArray(r.equipment) ? r.equipment : [])[i] || {}) })),
    coversheet: { ...emptyCoversheet(), ...(r.coversheet || {}) },
    po: { ...emptyPo(), ...(r.po || {}) },
    bankChange: { ...emptyBankChange(), ...(r.bankChange || {}) },
    crf: { ...emptyCrf(), ...(r.crf || {}) },
    cbd: { ...emptyCbd(), ...(r.cbd || {}) },
    giftCard: { ...emptyGiftCard(), ...(r.giftCard || {}) },
    cashAdvance: { ...emptyCashAdvance(), ...(r.cashAdvance || {}) },
    factor4: { ...emptyFactor4(), ...(r.factor4 || {}) },
    greenlight: { ...emptyGreenlight(), ...(r.greenlight || {}) },
    pathward: { ...emptyPathward(), ...(r.pathward || {}) },
    sales: { salesRep: "", salesOffice: "", salesAgentName: "", ...(r.sales || {}) },
    notes: r.notes || "",
  };
  // Identity numbers must stay strings — leading zeros (routing/account/SSN/zip/tax
  // ID/MID) are lost if the model returned them as JSON numbers instead of strings.
  const str = (v) => (v == null || v === "" ? "" : String(v));
  out.banking.routing = str(out.banking.routing);
  out.banking.account = str(out.banking.account);
  out.business.federalTaxId = str(out.business.federalTaxId);
  out.business.dnb = str(out.business.dnb);
  out.business.locationZip = str(out.business.locationZip);
  out.business.corpZip = str(out.business.corpZip);
  out.owners.forEach((o) => { o.ssn = str(o.ssn); o.zip = str(o.zip); o.dlNumber = str(o.dlNumber); });
  out.po.mid = str(out.po.mid);
  const bcNum = ["merchantId", "fundRouting", "fundAccount", "billRouting", "billAccount"];
  bcNum.forEach((k) => { out.bankChange[k] = str(out.bankChange[k]); });
  out.crf.merchantId = str(out.crf.merchantId);
  out.crf.ebtFns = str(out.crf.ebtFns);
  const gcArr = (v, n, empty) => {
    const list = Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : [];
    return Array.from({ length: n }, (_, i) => {
      const row = { ...empty() };
      for (const k of Object.keys(row)) row[k] = str((list[i] || {})[k]);
      return row;
    });
  };
  out.giftCard.eq = gcArr(out.giftCard.eq, 3, () => ({ qty: "", terminalType: "", bizType: "", model: "", serial: "" }));
  out.giftCard.locations = gcArr(out.giftCard.locations, 2, emptyGiftCardLoc);
  ["numLocations", "merchantProcessingNum", "giftCardMerchantNum", "omahaMerchantNum", "mcc",
   "affMerchantId", "affAltId", "affExistingNum", "affPromoNumber"].forEach((k) => { out.giftCard[k] = str(out.giftCard[k]); });
  out.cbd.stateHempLicense = str(out.cbd.stateHempLicense);
  // Cash advance: everything is text; booleans stay booleans. Positions arrive as
  // an array or (from the review form's numeric paths) an object keyed "0".."2".
  const caIn = out.cashAdvance;
  const caPosIn = Array.isArray(caIn.positions)
    ? caIn.positions
    : caIn.positions && typeof caIn.positions === "object"
      ? Object.keys(caIn.positions).sort((a, b) => a - b).map((k) => caIn.positions[k])
      : [];
  caIn.positions = [0, 1, 2].map((i) => ({
    lender: str(caPosIn[i]?.lender), amount: str(caPosIn[i]?.amount), balance: str(caPosIn[i]?.balance),
  }));
  const truthy = (v) => (typeof v === "string" ? !/^(|false|no|n|0|off)$/i.test(v.trim()) : Boolean(v));
  // seasonal is a yes / no: every application ticks its "Yes" or (when not) its "No" from it
  out.transaction.seasonal = truthy(out.transaction.seasonal);
  for (const [k, v] of Object.entries(emptyCashAdvance())) {
    if (k === "positions") continue;
    caIn[k] = typeof v === "boolean" ? truthy(caIn[k]) : str(caIn[k]);
  }
  if (typeof r.cashAdvance?.bankruptcy === "boolean") caIn.bankruptcy = r.cashAdvance.bankruptcy ? "yes" : "no";
  // Factor4 set-up: every field is text (numbers keep their leading zeros).
  for (const k of Object.keys(emptyFactor4())) out.factor4[k] = str(out.factor4[k]);
  // Greenlight CBD packet: text stays text; the checkboxes stay booleans.
  for (const [k, v] of Object.entries(emptyGreenlight())) {
    out.greenlight[k] = typeof v === "boolean" ? truthy(out.greenlight[k]) : str(out.greenlight[k]);
  }
  // A third owner read from the documents is the Greenlight form's principal 3
  // (the other forms have room for two) — unless principal 3 was typed in.
  const o3 = owners[2];
  const O3 = { first: "o3First", last: "o3Last", title: "o3Title", ownershipPct: "o3Pct", homeAddress: "o3Address", city: "o3City", state: "o3State", zip: "o3Zip",
    email: "o3Email", phone: "o3Phone", ssn: "o3Ssn", dlNumber: "o3Dl", dlState: "o3DlState", dob: "o3Dob" };
  if (o3 && typeof o3 === "object" && Object.values(O3).every((k) => !out.greenlight[k])) {
    for (const [from, to] of Object.entries(O3)) out.greenlight[to] = str(o3[from]);
  }
  // Pathward application: text stays text; the checkboxes stay booleans. A fourth
  // owner is its principal 4 (its principal 3 is the Greenlight form's) — unless typed in.
  for (const [k, v] of Object.entries(emptyPathward())) {
    out.pathward[k] = typeof v === "boolean" ? truthy(out.pathward[k]) : str(out.pathward[k]);
  }
  const o4 = owners[3];
  const O4 = Object.fromEntries(Object.entries(O3).map(([from, to]) => [from, to.replace(/^o3/, "o4")]));
  if (o4 && typeof o4 === "object" && Object.values(O4).every((k) => !out.pathward[k])) {
    for (const [from, to] of Object.entries(O4)) out.pathward[to] = str(o4[from]);
  }
  // The review form writes products via numeric paths, which arrive as an
  // object keyed "0".."19" — accept either shape; at least 10 rows, at most the
  // form's 20.
  const prodsIn = out.cbd.products;
  const prodList = Array.isArray(prodsIn)
    ? prodsIn
    : prodsIn && typeof prodsIn === "object"
      ? Object.keys(prodsIn).sort((a, b) => a - b).map((k) => prodsIn[k])
      : [];
  out.cbd.products = Array.from({ length: Math.max(10, Math.min(20, prodList.length)) }, (_, i) => ({
    name: str(prodList[i]?.name), distributor: str(prodList[i]?.distributor), state: str(prodList[i]?.state),
  }));
  return out;
}

const emptyBusiness = () => ({
  dba: "", legalName: "", locationAddress: "", locationCity: "", locationState: "", locationZip: "",
  corpAddress: "", corpCity: "", corpState: "", corpZip: "", phone: "", fax: "", contactName: "",
  contactPhone: "", customerServicePhone: "", email: "", website: "", federalTaxId: "", taxType: "",
  taxFilingName: "", dnb: "", businessType: "", productsSold: "", organizationType: "", stateIssued: "",
  businessStarted: "", lengthOwnershipYears: "", lengthOwnershipMonths: "",
});
const emptyOwner = () => ({
  first: "", last: "", title: "", ownershipPct: "", homeAddress: "", city: "", state: "", zip: "",
  phone: "", email: "", ssn: "", dob: "", dlNumber: "", dlState: "", dlExp: "",
});
const emptyBanking = () => ({ bankName: "", routing: "", account: "", bankPhone: "", accountType: "" });
const emptyTransaction = () => ({
  monthlyVolume: "", avgTicket: "", highTicket: "", amexVolume: "", swipePct: "", motoPct: "",
  internetPct: "", salesToConsumerPct: "", salesToBusinessPct: "", salesToGovPct: "",
  previousProcessor: "", reasonForLeaving: "", seasonal: false,
});
const emptyFees = () => ({
  // Authorization fees
  authVmcda: "", fleet: "", pinDebit: "", pinDebitPct: "", ebt: "", salesTxn: "", electronicAvs: "", voiceAuth: "", voiceAvs: "",
  // Monthly fees
  monthlyService: "", monthlyMinimum: "", wireless: "", pinDebitMonthly: "", industryCompliance: "",
  // Miscellaneous fees
  chargeback: "", retrieval: "", achReject: "", annual: "", batch: "", returnTxn: "", equipmentRental: "", monthToBill: "",
  earlyTermination: "",
  // Merrick-specific
  basilPos: "", saasFee: "", inactivityFee: "", gatewayMonthly: "", gatewayTxn: "", monthlyMisc: "",
});
const emptyServiceAcceptance = () => ({
  cardVisaCredit: false, cardVisaDebit: false, cardMcCredit: false, cardMcDebit: false,
  cardDiscover: false, cardAmex: false, cardPin: false, cardEbt: false,
  discountPlan: "", // 'flat' | 'passthrough'
  flatCreditPct: "", flatDebitPct: "", flatAmexPct: "",
  passCreditPct: "", passDebitPct: "", passAmexPct: "",
  assessments: "", // 'included' | 'billed'
  paymentMethod: "", // 'daily' | 'monthly'
});
const emptySignatures = () => ({
  printedName: "", title: "", date: "", printedName2: "", title2: "", date2: "",
});
const emptyEquip = () => ({ type: "", model: "", quantity: "", acquisition: "", onCoversheet: false });
// Bank Account Change Request form (manually filled by the rep — not extracted).
const emptyBankChange = () => ({
  merchantId: "",
  fundBankName: "", fundRouting: "", fundAccount: "",
  billBankName: "", billRouting: "", billAccount: "",
  addrMatchesFile: false, addrChangeLegal: false, addrChangeDba: false,
  settleChargebacksToFunding: false,
  docVoidedCheck: false, docBankLetter: false, docBankStatement: false,
});

// Change Request Form (CRF) — a standalone one-page document; filled manually.
const emptyCrf = () => ({
  merchantId: "", ownerName: "", dba: "", legalName: "",
  dbaName: "", legalAddress: "", dbaAddress: "", emailAddress: "", dbaPhone: "", dbaFax: "", website: "",
  amexOptBluePlan: "", amexOptBlueRate: "", amexDirectSe: "", addDiscover: false,
  pinDebitDiscount: false, pinDebitRate: "", ebtFns: "", ebtFee: "", addCashBenefits: false,
  myMerchantBenefits: false, myMerchantBenefitsRate: "", vmdDiscount: false, vmdNewRate: "",
  checkCardDiscount: false, checkCardRate: "", other1: "", other1Rate: "", other2: "", other2Rate: "",
  notes: "",
});
// Clover/Omaha Gift Card setup packet — standalone document, filled manually.
// Wholesale Payments cash advance (MCA) application — standalone, filled manually.
const emptyCashAdvance = () => ({
  isoName: "", agentName: "", requestedAmount: "", useOfFunds: "",
  docCcStatements: false, docBankStatements: false, docDriversLicense: false, docVoidedCheck: false,
  positions: [], // up to 3 existing advances: { lender, amount, balance }
  bankruptcy: "", bankruptcyDetails: "", rent: "", mortgage: "",
  totalCcSales: "", totalGrossDeposits: "", avgBankBalance: "", avgNsf: "",
  owner1Mobile: "", owner1CreditScore: "", owner2Mobile: "", owner2CreditScore: "",
});
// Greenlight Payments CBD packet — standalone document, filled manually (the
// business, owners, banking, volumes and pricing come from the application).
const emptyGreenlight = () => ({
  isoOffice: "", program: "", sendMailTo: "", // 'corporate' | 'dba'
  description: "", mcc: "", fulfillmentCenter: "", fulfillmentContact: "",
  bankruptcy: "", match: "", chargedAt: "", // 'yes'|'no' ; 'purchase'|'shipment'
  refundPolicy: "", daysToDelivery: "", depositRequired: "", depositPct: "",
  mktSocial: false, mktSms: false, mktEmail: false, mktAffiliate: false, mktOnlineAds: false, mktDirectMail: false, mktRadioTv: false,
  o3First: "", o3Last: "", o3Title: "", o3Pct: "", o3Address: "", o3City: "", o3State: "", o3Zip: "",
  o3Email: "", o3Phone: "", o3Ssn: "", o3Dl: "", o3DlState: "", o3Dob: "",
  mtCashDiscount: false, mtRetail: false, mtEcommerce: false, mtMoto: false,
  cdSwipe: "", cdKeyed: "", retailSwipe: "", retailKeyed: "", ecomInternet: "", ecomPhone: "", motoMail: "", motoPhone: "",
  amexSe: "",
  eqPos: false, eqManufacturer: "", eqModel: "", eqGateway: false, gatewayProvider: "",
  eqVirtual: false, virtualProvider: "", eqSoftware: false, softwareProvider: "",
  crm: "", crmName: "", // crm: 'yes' | 'no'
  cdRate: "", qualPerItem: "", qualRate: "", midQualRate: "", nonQualRate: "",
  underwritingFee: "", riskMonitoringFee: "", merlinkFee: "",
  docApplication: false, docVoidedCheck: false, docArticles: false, docBankExisting: false, docBankNew: false,
  docProcessing: false, docLicense: false, docDomain: false, docWebsite: false, docProducts: false,
  docCoa: false, docDropShip: false, docAffiliate: false,
  freeTrial: "", // 'yes' | 'no'
});
// Pathward "Merchant Application and Agreement": what only it asks (the business,
// owners 1-2, banking, volumes, fees and card types come from the shared sections;
// principal 3 is shared with the Greenlight form, and the fields left blank fill
// in from the rest of the application — see formMaps PW_PRINT).
const PW_OWNER = (n) => Object.fromEntries(["First", "Last", "Title", "Pct", "Address", "City", "State", "Zip", "Phone", "Email", "Ssn", "Dob", "Dl", "DlState"].map((k) => [`o${n}${k}`, ""]));
const emptyPathward = () => ({
  merchantNumber: "", mcc: "", tinType: "", // 'ein' | 'ssn'
  optIn: "", acceptsCards: "", deposits: "", daysToDelivery: "", // 'in'|'out' ; 'yes'|'no'
  mJan: false, mFeb: false, mMar: false, mApr: false, mMay: false, mJun: false, mJul: false, mAug: false, mSep: false, mOct: false, mNov: false, mDec: false,
  siteLocation: "", siteLocationOther: "", zone: "", // 'apartment'|'home'|'isolated'|'mall'|'office'|'shopping'|'other' ; 'business'|'industrial'|'residential'
  nameStoreFront: false, nameDoor: false, nameWindow: false,
  sqFootage: "", licenseVisible: "", floors: "", occupies: "", occupiesOther: "", remainingFloors: "", employees: "", registers: "",
  fulfillment: "", vendorName: "", vendorPhone: "", vendorAddress: "", vendorCity: "", vendorState: "", vendorZip: "", // 'direct'|'vendor'|'other'
  cardFleet: false, pinPlan: "", pinPlanPct: "", servicePlan: "", // 'passthrough'|'flat' ; 'core'|'growth'
  ...Object.fromEntries([1, 2, 3].flatMap((n) => ["Type", "Make", "Model", "Deploy", "Conn"].map((k) => [`eq${n}${k}`, ""]))),
  payAppName: "", payAppVersion: "", tpp: "", tppName: "", tppAddress: "", tppPhone: "", tppEmail: "",
  cp1: "", cp2: "", cp3: "", cp4: "", // control prong: 'yes' | 'no'
  ...PW_OWNER(3), ...PW_OWNER(4),
});
// Factor4 gift & loyalty merchant set-up form — standalone document, filled manually.
const emptyFactor4 = () => ({
  companyName: "", numLocations: "", phoneExt: "",
  perLocationPricing: "", numCards: "", cardPricing: "", cardNotes: "",
  primaryContact: "", primaryPhone: "", primaryEmail: "",
  secondaryContact: "", secondaryPhone: "", secondaryEmail: "",
  integration: "", // 'standalone' | 'integrated'
  ipOrDial: "", // 'ip' | 'dial'
  terminalType: "", numTerminals: "", ccProcessor: "",
  program: "", // 'gift' | 'loyalty' | 'both'
  loyaltyOption: "", // 'points' | 'threshold' | 'cashback' | 'punch'
  bankBranch: "", bankCity: "", bankState: "",
});
const emptyGiftCardLoc = () => ({ dba: "", street: "", city: "", state: "", zip: "", phone: "", fax: "", contact: "", positionTitle: "", email: "", processingNum: "" });
const emptyGiftCard = () => ({
  appKind: "", tieTo: "", resubmission: false, additionalInfo: false, numLocations: "", // appKind: 'new' | 'outlet' | 'entitle'
  eq: [], // up to 3 rows: { qty, terminalType, bizType, model, serial }
  merchantProcessingNum: "", giftCardMerchantNum: "", chain: "", omahaMerchantNum: "", mcc: "",
  setUpFee: "", addlLocFee: "", activationFee: "", redemptionFee: "", reloadFee: "", voidFee: "", balanceFee: "", otherFee: "", monthlyMinFee: "", monthlyFee: "",
  locations: [], // up to 2 additional-location blocks
  affBank: "", affMerchantId: "", affAltId: "", affExistingNum: "", affPromoNumber: "",
});
// Hemp/CBD disclosure + CBD amendment — standalone documents, filled manually.
const emptyCbd = () => ({
  agreementDate: "", stateHempLicense: "",
  growsHemp: "", manufacturesHemp: "", advertisesHemp: "", // 'yes' | 'no' | ''
  products: [], // schedule rows: { name, distributor, state }
});
const emptyPo = () => ({
  mid: "", team: "", salesManager: "", billTo: "", shipTo: "", // 'dba'|'rep'|'other'
  shAttention: "", shipStreet: "", shipCity: "", shipState: "", shipZip: "",
  shippingMethod: "", payPlan: "", billingType: "", shCost: "", salesTax: "", frontendPlatform: "",
});
const emptyCoversheet = () => ({
  territoryManager: "", teamColor: "",
  telemarketing: false, reBoard: false,
  docPictures: false, docStatements: false,
  platform: "", platformOther: "", // 'tsys' | 'fdomaha' | 'fdnorth' | 'other'
  etf: "", annualFee: "", monthlyMin: "", svcFee: "", cashDiscount: false, cashDiscountTerminalRate: "", bypassFee: false,
  shipping: "", shippingOther: "", // 'dba' | 'agent' | 'other'
  vasGiftCards: false, vasCheckServices: false, vasWpiRewards: false, vasCustomerConnect: false,
  fbAppType: "", fbConnection: "", // 'retail'|'restaurant'|'ecommerce'|'moto' ; 'ethernet'|'dial'|'wifi'|'wireless'
  enPinDebit: false, enEbt: false, enWex: false, fnsNumber: "",
  autoClose: false, autoCloseTime: "", timezone: "", tips: "", // 'pst'|'mst'|'cst'|'est' ; 'none'|'tipline'|'tipprompt'
  serverNumbers: false, avsCvv: false, invoiceNumber: false, specialOther: "",
  notes: "",
});

function mockRecord() {
  return {
    appType: "citizens",
    appTypeConfidence: "high",
    documents: { hasVoidedCheck: true, hasDriversLicense: true, pageCount: 3 },
    business: {
      dba: "Sunrise Cafe", legalName: "Sunrise Hospitality LLC",
      locationAddress: "418 Market Street", locationCity: "Springfield", locationState: "IL", locationZip: "62704",
      corpAddress: "418 Market Street", corpCity: "Springfield", corpState: "IL", corpZip: "62704",
      phone: "(217) 555-0148", fax: "", contactName: "Maria Alvarez", contactPhone: "(217) 555-0148",
      customerServicePhone: "(217) 555-0148", email: "maria@sunrisecafe.com", website: "www.sunrisecafe.com",
      federalTaxId: "47-1928374", taxType: "EIN", taxFilingName: "Sunrise Hospitality LLC", dnb: "",
      businessType: "Restaurant", productsSold: "Coffee, breakfast & lunch",
      organizationType: "LLC", stateIssued: "IL", businessStarted: "03/2019",
      lengthOwnershipYears: "7", lengthOwnershipMonths: "3",
    },
    owners: [
      {
        first: "Maria", last: "Alvarez", title: "Owner", ownershipPct: "100",
        homeAddress: "22 Elm Court Apt 4B", city: "Springfield", state: "IL", zip: "62704",
        phone: "(217) 555-0148", email: "maria@sunrisecafe.com", ssn: "123-45-6789", dob: "03/14/1985",
        dlNumber: "A123-4567-8901", dlState: "IL", dlExp: "03/14/2028",
      },
      { ...emptyOwner() },
    ],
    banking: {
      bankName: "First National Bank", routing: "071000013", account: "1234567890",
      bankPhone: "(800) 555-0199", accountType: "checking",
    },
    transaction: {
      monthlyVolume: "45000", avgTicket: "28", highTicket: "350", amexVolume: "5000",
      swipePct: "90", motoPct: "5", internetPct: "5", salesToConsumerPct: "95",
      salesToBusinessPct: "5", salesToGovPct: "0", previousProcessor: "Square",
      reasonForLeaving: "Rates", seasonal: false,
    },
    fees: {
      authVmcda: "0.10", fleet: "0.10", pinDebit: "0.05", pinDebitPct: "0.20", ebt: "0.05", salesTxn: "0.05",
      monthlyService: "9.95", monthlyMinimum: "25", wireless: "10", pinDebitMonthly: "5", industryCompliance: "4.95",
      chargeback: "25", retrieval: "15", achReject: "25", annual: "99", batch: "0.20", returnTxn: "0.05",
      equipmentRental: "30", monthToBill: "Jan", earlyTermination: "295",
    },
    serviceAcceptance: {
      cardVisaCredit: true, cardVisaDebit: true, cardMcCredit: true, cardMcDebit: true,
      cardDiscover: true, cardAmex: true, cardPin: false, cardEbt: false,
      discountPlan: "flat", flatCreditPct: "2.49", flatDebitPct: "1.49", flatAmexPct: "2.89",
      passCreditPct: "", passDebitPct: "", passAmexPct: "", assessments: "billed", paymentMethod: "daily",
    },
    signatures: {
      printedName: "Maria Alvarez", title: "Owner", date: "06/27/2026",
      printedName2: "", title2: "", date2: "",
    },
    equipment: [
      { type: "Terminal", model: "Clover Flex", quantity: "1" },
      { type: "Pin Pad", model: "PAX A920", quantity: "1" },
      { type: "", model: "", quantity: "" },
    ],
    coversheet: {
      territoryManager: "Jordan Pike", teamColor: "Ice Kannon",
      telemarketing: false, reBoard: false, docPictures: true, docStatements: true,
      platform: "tsys", platformOther: "",
      etf: "295", annualFee: "99", monthlyMin: "25", svcFee: "9.95",
      cashDiscount: true, cashDiscountTerminalRate: "3.99", bypassFee: false,
      shipping: "dba", shippingOther: "",
      vasGiftCards: true, vasCheckServices: false, vasWpiRewards: true, vasCustomerConnect: false,
      fbAppType: "restaurant", fbConnection: "ethernet",
      enPinDebit: true, enEbt: false, enWex: false, fnsNumber: "",
      autoClose: true, autoCloseTime: "11:00 PM", timezone: "cst", tips: "tipprompt",
      serverNumbers: true, avsCvv: false, invoiceNumber: false, specialOther: "",
      notes: "Rush boarding requested.",
    },
    sales: { salesRep: "T. Nguyen", salesOffice: "Midwest", salesAgentName: "Tom Nguyen" },
    notes: "Bank details read from voided check; owner identity from IL driver's license.",
  };
}
