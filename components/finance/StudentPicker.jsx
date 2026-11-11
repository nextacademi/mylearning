"use client";

import PersonPicker from "../ui/PersonPicker";

const label = (student) => student.displayName || student.email || "Unnamed student";

export default function StudentPicker({ students, value, onChange, className }) {
  return (
    <PersonPicker
      people={students}
      value={value}
      onChange={onChange}
      className={className}
      getLabel={label}
      noneLabel="Not a specific student"
      noMatchLabel="No student matches"
      ariaLabel="student"
    />
  );
}
