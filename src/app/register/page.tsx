import { listBranches, listDepartments } from "@/lib/employeeQueries";
import RegisterForm from "@/app/components/RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [branches, departments] = await Promise.all([listBranches(), listDepartments()]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative min-h-full flex items-center justify-center py-12">
        <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-red-800 to-red-950 overflow-hidden">
          <div className="absolute inset-0 opacity-40">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
            <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-rose-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "1s" }}></div>
            <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-red-700 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "2s" }}></div>
          </div>
        </div>

        <div className="relative z-10 w-full flex justify-center">
          <RegisterForm branches={branches} departments={departments} />
        </div>
      </div>
    </div>
  );
}
