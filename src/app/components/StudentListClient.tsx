"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Filter,
  MoreVertical,
  Download,
  Trash2,
  Edit,
  Home,
  ChevronRight,
} from "lucide-react";

// ─── Interfaces & Mock Data ──────────────────────────────────────────────────

export interface Student {
  id: string;
  name: string;
  email: string;
  phone: string;
  ageGroup: string;
  packageName: string;
  status: "Active" | "Trial" | "Suspended";
  enrollmentDate: string;
}

const MOCK_STUDENTS: Student[] = [
  {
    id: "STU-001",
    name: "Alexander Wright",
    email: "alexander.wright@example.com",
    phone: "+6012-345-6789",
    ageGroup: "7-9 years",
    packageName: "Basic English Speaking",
    status: "Active",
    enrollmentDate: "2026-01-15",
  },
  {
    id: "STU-002",
    name: "Sophia Chen",
    email: "sophia.chen@example.com",
    phone: "+6017-987-6543",
    ageGroup: "10-12 years",
    packageName: "Creative Coding Level 1",
    status: "Active",
    enrollmentDate: "2026-03-10",
  },
  {
    id: "STU-003",
    name: "Ryan Harrison",
    email: "ryan.harrison@example.com",
    phone: "+6011-222-3333",
    ageGroup: "Teens (13-17)",
    packageName: "Advanced Public Speaking",
    status: "Trial",
    enrollmentDate: "2026-07-01",
  },
  {
    id: "STU-004",
    name: "Zara Amelia",
    email: "zara.amelia@example.com",
    phone: "+6013-444-5555",
    ageGroup: "7-9 years",
    packageName: "Creative Writing Spark",
    status: "Suspended",
    enrollmentDate: "2025-11-20",
  },
  {
    id: "STU-005",
    name: "Ethan Lim",
    email: "ethan.lim@example.com",
    phone: "+6016-555-6666",
    ageGroup: "10-12 years",
    packageName: "Robotics Foundation",
    status: "Active",
    enrollmentDate: "2026-02-05",
  },
  {
    id: "STU-006",
    name: "Mia Thompson",
    email: "mia.thompson@example.com",
    phone: "+6019-777-8888",
    ageGroup: "Teens (13-17)",
    packageName: "Creative Writing Spark",
    status: "Active",
    enrollmentDate: "2026-04-18",
  },
  {
    id: "STU-007",
    name: "Joshua Tan",
    email: "joshua.tan@example.com",
    phone: "+6012-444-7711",
    ageGroup: "10-12 years",
    packageName: "Basic English Speaking",
    status: "Trial",
    enrollmentDate: "2026-06-28",
  },
];

const AGE_GROUPS = ["All Age Groups", "7-9 years", "10-12 years", "Teens (13-17)"];
const PACKAGES = ["All Packages", "Basic English Speaking", "Creative Coding Level 1", "Advanced Public Speaking", "Creative Writing Spark", "Robotics Foundation"];
const STATUSES = ["All Statuses", "Active", "Trial", "Suspended"];

export default function StudentListClient() {
  const [search, setSearch] = useState("");
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("All Age Groups");
  const [selectedPackage, setSelectedPackage] = useState("All Packages");
  const [selectedStatus, setSelectedStatus] = useState("All Statuses");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // ─── Filter Logic ───────────────────────────────────────────────────────────

  const filteredStudents = useMemo(() => {
    return MOCK_STUDENTS.filter((student) => {
      const matchesSearch =
        student.name.toLowerCase().includes(search.toLowerCase()) ||
        student.email.toLowerCase().includes(search.toLowerCase()) ||
        student.id.toLowerCase().includes(search.toLowerCase()) ||
        student.phone.includes(search);
      
      const matchesAge =
        selectedAgeGroup === "All Age Groups" || student.ageGroup === selectedAgeGroup;
      
      const matchesPackage =
        selectedPackage === "All Packages" || student.packageName === selectedPackage;

      const matchesStatus =
        selectedStatus === "All Statuses" || student.status === selectedStatus;

      return matchesSearch && matchesAge && matchesPackage && matchesStatus;
    });
  }, [search, selectedAgeGroup, selectedPackage, selectedStatus]);



  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/sms" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded">
            SMS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Student</span>
        </nav>

        {/* Header Section */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Student Management</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage and monitor students enrolled across programs</p>
          </div>
          <div className="flex gap-3">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm">
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm">
              <Plus className="w-4 h-4" />
              <span>Add Student</span>
            </button>
          </div>
        </header>



        {/* Filter Controls */}
        <section className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-5 h-5" />
            </span>
            <input
              type="text"
              placeholder="Search by ID, Name or Email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-500 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Age Group Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={selectedAgeGroup}
                onChange={(e) => setSelectedAgeGroup(e.target.value)}
                className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-500 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {AGE_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>

            {/* Package Filter */}
            <select
              value={selectedPackage}
              onChange={(e) => setSelectedPackage(e.target.value)}
              className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-500 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {PACKAGES.map((pkg) => (
                <option key={pkg} value={pkg}>
                  {pkg}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-500 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Students Table */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-4">ID / Student</th>
                  <th className="px-6 py-4">Contact Info</th>
                  <th className="px-6 py-4">Age Group</th>
                  <th className="px-6 py-4">Package</th>
                  <th className="px-6 py-4">Enroll Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm text-slate-700 dark:text-slate-300">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition-colors group">
                      {/* Name & Avatar */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900 border border-indigo-100 dark:border-indigo-700 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold shrink-0">
                            {student.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">{student.name}</div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">{student.id}</div>
                          </div>
                        </div>
                      </td>
                      {/* Contact Details */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-slate-900 dark:text-slate-100">{student.email}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{student.phone}</div>
                        </div>
                      </td>
                      {/* Age Group */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                          {student.ageGroup}
                        </span>
                      </td>
                      {/* Package Name */}
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {student.packageName}
                      </td>
                      {/* Enrollment Date */}
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500 dark:text-slate-400 font-mono text-xs">
                        {student.enrollmentDate}
                      </td>
                      {/* Status badge */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${
                            student.status === "Active"
                              ? "bg-emerald-50 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-700"
                              : student.status === "Trial"
                              ? "bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-700"
                              : "bg-rose-50 dark:bg-rose-900 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-700"
                          }`}
                        >
                          {student.status}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-slate-400 relative">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <button className="p-1.5 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      No student records found matching the criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {filteredStudents.length > 0 && (
            <div className="bg-slate-50/50 dark:bg-slate-800/50 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <div>
                Showing <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredStudents.length}</span> of{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredStudents.length}</span> results
              </div>
              <div className="flex gap-2">
                <button disabled className="px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-900 text-slate-400 cursor-not-allowed">
                  Previous
                </button>
                <button disabled className="px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-900 text-slate-400 cursor-not-allowed">
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
