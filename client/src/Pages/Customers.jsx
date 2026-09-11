import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchCustomers } from "../slices/customerSlice";
import { useNavigate } from "react-router-dom";
import CreateCustomerModal from "../Components/CreateCustomerModel";
import { FaPlus } from "react-icons/fa";

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
            background: "bg-blue-50 border-blue-100",
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
        <>
          {filteredCustomers.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-500">
              No customers found
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px]">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left p-4">Customer</th>
                      <th className="text-left p-4">Customer Type</th>
                      <th className="text-left p-4">Phone</th>
                      <th className="text-left p-4">Email</th>
                      <th className="text-left p-4">Address</th>
                      <th className="text-left p-4">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredCustomers.map((customer) => (
                      <tr
                        key={customer._id}
                        className="border-t hover:bg-slate-50 cursor-pointer transition"
                        onClick={() => navigate(`/customers/${customer._id}`)}
                      >
                        <td className="p-4 font-medium">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-800/80 text-white flex items-center justify-center font-semibold text-sm">
                              {customer.fullName?.charAt(0)?.toUpperCase()}
                            </div>
                            <span>{customer.fullName || "N/A"}</span>
                          </div>
                        </td>

                        <td className="p-4 capitalize">
                          {customer.customerType || "-"}
                        </td>

                        <td className="p-4">
                          {customer.phone || "-"}
                        </td>

                        <td className="p-4">
                          {customer.email || "-"}
                        </td>

                        <td className="p-4 max-w-xs truncate">
                          {customer.address || "-"}
                        </td>

                        <td className="p-4">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${getStatusClass(
                              customer.status
                            )}`}
                          >
                            {customer.status || "active"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <CreateCustomerModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </div>
  );
}
export default Customers;