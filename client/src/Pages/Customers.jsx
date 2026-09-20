import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchCustomers } from "../slices/customerSlice";
import { useNavigate } from "react-router-dom";
import CreateCustomerModal from "../Components/CreateCustomerModel";
import { FaPlus } from "react-icons/fa";
import TooltipCell from "../Components/TooltipCell";
import DataTable from "../Components/DataTable";

function Customers() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { customers, loading } = useSelector((state) => state.customer);
  const error = useSelector((state) => state.customer.error);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    dispatch(fetchCustomers());
  }, [dispatch]);

  const customerList = Array.isArray(customers) ? customers : [];

  const searchLower = search.toLowerCase();
  const filteredCustomers = customerList.filter((customer) => {
    const fullName = customer.fullName?.toLowerCase() || "";
    const phone = customer.phone || "";
    const alternatePhone = customer.alternatePhone || "";
    const companyName = customer.companyName?.toLowerCase() || "";
    return (
      fullName.includes(searchLower) ||
      phone.includes(search) ||
      alternatePhone.includes(search) ||
      companyName.includes(searchLower)
    );
  });

  const getStatusClass = (status) => {
    if (status?.toLowerCase() === "active") {
      return "bg-green-100 text-green-700";
    }
    return "bg-red-100 text-red-700";
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-500 mt-1">Manage and view customer records</p>
        </div>
        <button
          className="bg-blue-800/80 text-white hover:bg-blue-600 px-5 py-2.5 rounded-lg flex items-center gap-2 self-start sm:self-auto"
          onClick={() => setShowModal(true)}
        >
          <FaPlus /> Add Customer
        </button>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          {
            key: "total",
            label: "Total Customers",
            count: customerList.length,
            color: "text-slate-900",
            background: "bg-slate-50 border-slate-100",
          },
          {
            key: "residential",
            label: "Residential",
            count: customerList.filter((c) => c.customerType === "residential").length,
            color: "text-green-700",
            background: "bg-green-50 border-green-100",
          },
          {
            key: "commercial",
            label: "Commercial",
            count: customerList.filter((c) => c.customerType === "commercial").length,
            color: "text-blue-700",
            background: "bg-red-900 border-blue-100",
          },
        ].map((card) => (
          <button
            type="button"
            key={card.key}
            className={`border rounded-2xl p-6 text-left shadow-sm transition hover:shadow-md ${card.background}`}
          >
            <p className="text-sm font-medium text-slate-600">{card.label}</p>
            <p className={`text-5xl font-bold mt-2 ${card.color}`}>{card.count}</p>
            <p className="text-xs text-slate-500 mt-2">Click to view</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <input
          type="text"
          placeholder="Search by name, phone, alternate phone, or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-3 py-2.5 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-600"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-500">
          Loading customers...
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-600 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Customer List */}
      {!loading && !error && (
        <DataTable
          headers={[
            { key: "name", label: "Customer", width: "22%" },
            { key: "type", label: "Customer Type", width: "14%" },
            { key: "phone", label: "Phone", width: "15%" },
            { key: "email", label: "Email", width: "20%" },
            { key: "address", label: "Address", width: "20%" },
            { key: "status", label: "Status", width: "9%" },
          ]}
          loading={loading}
          error={error}
          emptyMessage="No customers found"
          minWidth="min-w-[1000px]"
        >
          {filteredCustomers.map((customer) => (
            <tr
              key={customer._id}
              className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition"
              onClick={() => navigate(`/customers/${customer._id}`)}
            >
              <td className="p-3.5 font-medium">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-800/80 text-white flex items-center justify-center font-semibold text-sm shrink-0">
                    {customer.fullName?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <TooltipCell value={customer.fullName} maxWidth="max-w-[200px]" className="font-semibold text-slate-900" />
                    {customer.companyName && (
                      <TooltipCell value={customer.companyName} maxWidth="max-w-[180px]" className="text-xs text-slate-500" />
                    )}
                  </div>
                </div>
              </td>

              <td className="p-3.5 capitalize text-slate-700">
                {customer.customerType || "-"}
              </td>

              <td className="p-3.5 text-slate-700">
                <TooltipCell value={customer.phone || customer.alternatePhone} maxWidth="max-w-[140px]" />
              </td>

              <td className="p-3.5 text-slate-700">
                <TooltipCell value={customer.email} maxWidth="max-w-[190px]" />
              </td>

              <td className="p-3.5 text-slate-700">
                <TooltipCell value={customer.address} maxWidth="max-w-[220px]" />
              </td>

              <td className="p-3.5">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusClass(
                    customer.status
                  )}`}
                >
                  {customer.status || "active"}
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <CreateCustomerModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </div>
  );
}
export default Customers;