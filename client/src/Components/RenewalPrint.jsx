import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { fetchRenewalByIdAPI } from "../API/renewalAPI";
import { fetchServicesAPI } from "../API/serviceAPI";
import { FaPhoneAlt, FaMapMarkerAlt } from "react-icons/fa";
import { MdEmail } from "react-icons/md";
import { FaEarthAfrica } from "react-icons/fa6";

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "24/06/2026";

const getContractPeriod = (renewalDate) => {
  const date = renewalDate ? new Date(renewalDate) : new Date("2026-06-24");
  let startYear = date.getFullYear();
  let startMonth = date.getMonth() + 1; // Month following renewalDate
  if (startMonth > 11) {
    startMonth = 0;
    startYear += 1;
  }
  const startDate = new Date(startYear, startMonth, 1);
  const endDate = new Date(startYear + 1, startMonth, 0); // End of previous month next year

  const formatLongDate = (d) =>
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  return {
    startStr: formatLongDate(startDate),
    endStr: formatLongDate(endDate),
    periodStr: `${formatLongDate(startDate).toUpperCase()} to ${formatLongDate(endDate).toUpperCase()} (12 Months)`,
  };
};

const formatCurrency = (val) => {
  if (val === undefined || val === null) return "0.00";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

const numberToWords = (amount) => {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const belowHundred = (number) =>
    number < 20 ? ones[number] : `${tens[Math.floor(number / 10)]} ${ones[number % 10]}`.trim();
  const belowThousand = (number) => {
    const hundred = Math.floor(number / 100);
    const remainder = number % 100;
    return [hundred ? `${ones[hundred]} Hundred` : "", remainder ? belowHundred(remainder) : ""]
      .filter(Boolean)
      .join(" ");
  };

  const value = Math.round(Number(amount) || 0);
  if (!value) return "Rupees Zero Only";

  const parts = [
    [Math.floor(value / 10000000), "Crore"],
    [Math.floor((value % 10000000) / 100000), "Lakh"],
    [Math.floor((value % 100000) / 1000), "Thousand"],
    [value % 1000, ""],
  ];

  return `Rupees ${parts
    .filter(([number]) => number)
    .map(([number, label]) => `${belowThousand(number)}${label ? ` ${label}` : ""}`)
    .join(" ")} Only`;
};

function RenewalPrint() {
  const { id } = useParams();
  const token = useSelector((state) => state.auth.token);
  const [renewal, setRenewal] = useState(null);
  const [services, setServices] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadRenewalAndServices = async () => {
      try {
        const data = await fetchRenewalByIdAPI(id, token);
        setRenewal(data.renewal);
        const servicesData = await fetchServicesAPI(token);
        setServices(servicesData);
      } catch (requestError) {
        setError(requestError.message || "Contract renewal could not be loaded.");
      }
    };

    loadRenewalAndServices();
  }, [id, token]);

  if (error) {
    return <div className="p-8 text-sm text-slate-600">{error}</div>;
  }

  if (!renewal) {
    return (
      <div className="p-8 text-sm text-slate-500">
        Loading contract renewal...
      </div>
    );
  }

  const customer = renewal.customer || {};
  const customerName = customer.fullName || customer.companyName || "-";
  const addressLines = String(customer.address || "-").split(/\r?\n/);
  const { startStr, periodStr } = getContractPeriod(renewal.renewalDate);

  // Filter services for this customer
  const customerServices = services.filter((s) => {
    const serviceCustId = s.customer?._id || s.customer;
    return serviceCustId === customer._id;
  });

  const totalAmount = customerServices.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  const isPreview = new URLSearchParams(window.location.search).get("preview") === "true";
  const bgClass = isPreview ? "bg-[#525659]" : "bg-slate-100";

  return (
    <main className={`min-h-screen ${bgClass} px-4 py-6 font-[Times_New_Roman] text-[10.5pt] leading-[1.3] text-black print:bg-white print:p-0`}>
      <style>{`
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background-color: white !important;
          }
          main {
            background-color: white !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
        }
        ${isPreview ? `
          body {
            background-color: #525659 !important;
          }
        ` : ""}
      `}</style>

      {!isPreview && (
        <div className="mx-auto mb-4 flex w-[210mm] justify-end no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white cursor-pointer"
          >
            Download PDF
          </button>
        </div>
      )}

      <article className="mx-auto h-[297mm] w-[210mm] bg-white px-[15mm] py-[10mm] shadow-sm print:shadow-none flex flex-col justify-between box-border overflow-hidden">
        <div className="flex-grow flex flex-col justify-start">
          {/* Bordered Header */}
          <header className="border-2 border-[#002060] shrink-0">
            <div className="grid min-h-[108px] grid-cols-[124px_1fr]">
              <div className="flex items-center justify-center border-r-2 border-[#002060] px-2">
                <img src="/logo.png" alt="Samarth Pest Management" className="w-[96px] object-contain" />
              </div>
              <div className="px-3 pt-2">
                <h1 className="text-center text-[23pt] font-extrabold leading-none tracking-[0.03em] text-[#002060]">
                  SAMARTH PEST MANAGEMENT
                </h1>
                <div className="mt-2.5 grid grid-cols-2 divide-x-2 divide-[#002060] text-center text-[9.5pt] leading-[1.3] text-black">
                  <div className="px-2">
                    <p className="text-[10.5pt] font-bold text-[#002060] flex items-center justify-center gap-1.5">
                      <FaMapMarkerAlt className="text-[#002060] text-[9.5pt] shrink-0" />
                      <span>REGISTER OFFICE</span>
                    </p>
                    <p className="mt-1 font-semibold">Office No. 102, Balaji, New Vijay</p>
                    <p className="font-semibold">CHSL, Near Datta Mandir,</p>
                    <p className="font-semibold">Nallasopara (E) - 401209</p>
                  </div>
                  <div className="px-2">
                    <p className="text-[10.5pt] font-bold text-[#002060] flex items-center justify-center gap-1.5">
                      <FaMapMarkerAlt className="text-[#002060] text-[9.5pt] shrink-0" />
                      <span>CORPORATE OFFICE</span>
                    </p>
                    <p className="mt-1 font-semibold">Office No. B - 221, Bhaskar</p>
                    <p className="font-semibold">Commercial Complex, Near</p>
                    <p className="font-semibold">Platform No. 1, Virar (W)-401303</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 border-t-2 border-[#002060] text-[10.5pt] font-bold text-center text-black">
              <p className="flex items-center justify-center gap-2 py-1 border-r-2 border-[#002060] whitespace-nowrap">
                <span className="flex size-[15px] shrink-0 items-center justify-center rounded-full bg-[#002060] text-[8px] text-white">
                  <FaPhoneAlt />
                </span>
                <span>8356080548</span>
              </p>
              <p className="flex items-center justify-center gap-2 py-1 border-r-2 border-[#002060] whitespace-nowrap">
                <span className="flex size-[15px] shrink-0 items-center justify-center rounded-full bg-[#002060] text-[8px] text-white">
                  <MdEmail />
                </span>
                <span>samarthpest2022@gmail.com</span>
              </p>
              <p className="flex items-center justify-center gap-2 py-1 whitespace-nowrap">
                <span className="flex size-[15px] shrink-0 items-center justify-center rounded-full bg-[#002060] text-[8px] text-white">
                  <FaEarthAfrica />
                </span>
                <span>samarthpest.com</span>
              </p>
            </div>
          </header>

          {/* Title */}
          <div className="mt-3 bg-[#002060] py-1 text-center text-[12pt] font-bold text-white uppercase tracking-[0.06em] shrink-0">
            CONTRACT FORM
          </div>

          {/* Date and Recipient Section */}
          <div className="mt-3 flex justify-between items-start text-[10.5pt] leading-[1.35] text-black shrink-0">
            <div className="font-bold">
              <p className="mb-0.5">TO,</p>
              <div className="pl-6">
                {customer.companyName && (
                  <p className="mb-0 uppercase">HON. CHAIRMEN / SECRETARY,</p>
                )}
                <p className="mb-0 uppercase">{customerName}</p>
                {addressLines.map((line, index) => (
                  <p key={`${line}-${index}`} className="mb-0 uppercase">
                    {line}
                  </p>
                ))}
              </div>
            </div>
            <div className="text-right font-bold whitespace-nowrap pt-1">
              Date : {formatDate(renewal.renewalDate)}
            </div>
          </div>

          {/* Subject */}
          <p className="mt-3 text-center text-[10.5pt] leading-[1.4] shrink-0">
            <span className="font-bold border-b border-black pb-0.5">
              Sub : Pest Management Treatment to your premises.
            </span>
          </p>

          {/* Introduction */}
          <section className="mt-3 text-[10.5pt] leading-[1.4] text-justify text-black shrink-0">
            <p className="font-bold">Respected Sir/ Madam,</p>
            <p className="mt-1 text-justify">
              M/S Samarth Pest Management (SPM) Company is grateful for your cooperation.
              This is to inform you that the pest control service contract signed with
              your company for your premises. We kindly request you to continue the pest
              control services by renewing the contract as per the existing terms, rules,
              and conditions mentioned in the agreement.
            </p>
            <p className="mt-1 text-justify">
              The services will continue as per the agreed schedule and terms from {startStr},
              subject to your approval.
            </p>
            <p className="mt-1 text-justify">
              If you agree to renew the contract, please cooperate by signing the given
              agreement.
            </p>
          </section>

          {/* Service Table */}
          <section className="mt-3 shrink-0">
            <table className="w-full border-collapse border border-black text-[10pt] leading-[1.3] text-black">
              <thead>
                <tr className="bg-[#a3e635] text-black">
                  <th className="border border-black px-2 py-1.5 text-center font-bold text-[10pt] w-[28%]">
                    Service Name
                  </th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold text-[10pt] w-[17%]">
                    Frequency
                  </th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold text-[10pt] w-[38%]">
                    Location to be Treated
                  </th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold text-[10pt] w-[17%]">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody>
                {customerServices.length > 0 ? (
                  customerServices.map((service, index) => (
                    <tr key={service._id || index}>
                      <td className="border border-black px-3 py-1.5 align-middle font-bold">
                        {index + 1}) {String(service.serviceName || "").toUpperCase()}
                      </td>
                      <td className="border border-black px-3 py-1.5 align-middle text-center font-bold uppercase whitespace-nowrap">
                        {service.frequency || "-"}
                      </td>
                      <td className="border border-black px-3 py-1.5 align-middle font-medium">
                        {service.address || "-"}
                      </td>
                      <td className="border border-black px-3 py-1.5 align-middle text-center font-bold whitespace-nowrap">
                        Rs. {formatCurrency(service.amount)} <br />
                        <span className="text-[8.5pt] font-medium">(Per Annum)</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="border border-black px-3 py-1.5 align-middle font-bold text-center" colSpan="3">
                      No active services found for renewal
                    </td>
                    <td className="border border-black px-3 py-1.5 align-middle text-center font-bold whitespace-nowrap">
                      Rs. 0.00 <br />
                      <span className="text-[8.5pt] font-medium">(Per Annum)</span>
                    </td>
                  </tr>
                )}
                <tr className="font-bold">
                  <td colSpan="3" className="border border-black px-3 py-2 align-middle uppercase text-[10pt]">
                    AMOUNT IN WORDS – {numberToWords(totalAmount).toUpperCase()}
                  </td>
                  <td className="border border-black px-3 py-2 align-middle text-center whitespace-nowrap text-[10pt]">
                    Rs. {formatCurrency(totalAmount)} <br />
                    <span className="text-[8.5pt] font-medium">(Per Annum)</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Contract Info */}
          <section className="mt-3 space-y-0.5 text-[10.5pt] leading-[1.3] pl-2 font-semibold text-black shrink-0">
            <p>• Contract Period : {periodStr}</p>
            <p>• All payments should be made payable to Samarth Pest Management via GPAY / RTGS / Cheque.</p>
            <p>• The above quote is exclusive of GST and will be charged as per applicable rate.</p>
            <p>• Payment Term: Quarterly.</p>
          </section>

          {/* Terms and Conditions */}
          <section className="mt-3 shrink-0">
            <p className="text-center text-[10.5pt] font-bold border-b border-slate-300 pb-0.5 mb-1.5 text-black">
              Terms and conditions
            </p>
            <div className="space-y-0.5 text-[8pt] leading-[1.2] text-justify text-black font-semibold">
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>GST, is applicable as per the prevailing rate while invoicing and any changes in tax structure as bought in by the Government of India shall be binding on either parties.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>Note that pests like bats, birds, dogs, cats, monkeys, squirrels, scorpions, etc. are not covered in above services.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>Rodent Station are property of SPM and shall be taken back in case of expiry or termination of service contract.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>Charges are levied for misplacement or damage of rodent station that will be installed in your premises.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>The customer understands that SPM technicians have instructions not to handle the customer's property to avoid any inadvertent damage.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>A representative of the customer should be present during the pest management treatment to remove and shift all articles as necessary.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>SPM does not give any express or implied warranty or assurance on elimination or eradication of the pests in respect whereof this agreement is signed, during the period of this service contract,</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>SPM shall be obliged to carry out the necessary pest management operation without incurring any liability or obligation for any inconvenience, loss, injury or damage that may be caused to the customer or any occupant of, or visitor to, to the premises or to any property of any such persons.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>SPM shall not be liable for any loss, injury or damage to the customer or any occupant or visitor to the premises or to any property of any such persons by reason of or as a consequence of the pest management operations and treatment carried out by SPM pursuant to this agreement. Ensuring the safety of all valuables in the customer premises is solely the customer's responsibility.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>The customer has understood his/her obligation to ensure that shelter, entry and food are denied to pests as possible and to maintain hygienic conditions in the premises.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>All material(s) and equipment kept by SPM in customer's premises for carrying out/during service, remains the sole property of SPM and customer has no right over it/ them whatsoever.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>In the event of termination of agreement by either party or upon expiry, SPM will take back all equipment and other property such as Rodent bait-Station, etc. from the customer's premises.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="text-[5px] pt-1.5 shrink-0 text-black">●</span>
                <span>Services shall be rendered during working hrs with All days.</span>
              </p>
            </div>
          </section>
        </div>

        {/* Footer & Signature Section */}
        <footer className="mt-4 text-[10.5pt] leading-[1.3] text-black shrink-0">
          <div className="flex justify-between items-start">
            <span />
            <div className="text-center w-[220px]">
              <p className="font-semibold">Yours Faithfully</p>
              <p className="font-bold uppercase text-[9.5pt] mt-0.5 text-[#002060]">SAMARTH PEST MANAGEMENT</p>
              <div className="h-14 flex items-center justify-center my-0.5">
                <img
                  src="/signature.png"
                  alt="Authorised Signature"
                  className="max-h-14 w-auto object-contain"
                />
              </div>
              <p className="text-[9pt] border-t border-dotted border-slate-400 pt-0.5 font-bold">
                Authorised Signature
              </p>
            </div>
          </div>

          <div className="mt-2 text-center font-bold">
            <p className="uppercase text-[9.5pt] tracking-wide">
              WE HAVE READ ALL THE ABOVE RULES, TERMS AND CONDITIONS OF SERVICE AND WE / I ACCEPT THE SAME.
            </p>
            <p className="mt-1 text-[9.5pt]">WE HEREBY CONFIRM</p>
          </div>

          <div className="mt-3 text-[10pt] font-bold leading-[1.5]">
            <p>(CONTRACTEE SIGNATURE) --</p>
            <div className="flex justify-between items-center mt-1">
              <p>(CONTRACTEE NAME) --</p>
              <p>(CONTRACTEE MOB. NO) --</p>
            </div>
          </div>
        </footer>
      </article>
    </main>
  );
}

export default RenewalPrint;
