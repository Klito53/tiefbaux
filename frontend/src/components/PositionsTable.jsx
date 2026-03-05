function PositionsTable({ positions }) {
  if (!positions || positions.length === 0) {
    return <p className="text-gray-500">Noch keine Positionen erkannt.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border border-gray-300">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-3 py-2 text-left">Position</th>
            <th className="border px-3 py-2 text-left">Text</th>
            <th className="border px-3 py-2 text-left">Menge</th>
            <th className="border px-3 py-2 text-left">Einheit</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="border px-3 py-2">{p.number}</td>
              <td className="border px-3 py-2">{p.text}</td>
              <td className="border px-3 py-2">{p.quantity}</td>
              <td className="border px-3 py-2">{p.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PositionsTable;

