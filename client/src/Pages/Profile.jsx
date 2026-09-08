import { useSelector } from "react-redux";

function Profile() {
  const { user } = useSelector((state) => state.auth);

  return (
    <div className="bg-white rounded-xl p-6 shadow">
      <h1 className="text-2xl font-bold mb-6">
        Admin Profile
      </h1>

      <div className="space-y-4">
        <div>
          <label className="font-medium">Name</label>
          <p>{user?.name}</p>
        </div>

        <div>
          <label className="font-medium">Email</label>
          <p>{user?.email}</p>
        </div>

        <div>
          <label className="font-medium">Phone</label>
          <p>{user?.phone}</p>
        </div>
      </div>
    </div>
  );
}

export default Profile;