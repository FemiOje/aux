import { useEffect, useState } from "react";

const checks = [
  { name: "Fastify", path: "/api/" },
  { name: "Postgres", path: "/api/db" },
  { name: "Redis", path: "/api/redis" },
];

function Status({ name, path }: { name: string; path: string }) {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    fetch(path)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((body) => setStatus(`ok ${JSON.stringify(body)}`))
      .catch((err) => setStatus(`error ${err}`));
  }, [path]);

  return (
    <li>
      {name}: {status}
    </li>
  );
}

export default function App() {
  return (
    <>
      <h1>Aux</h1>
      <ul>
        {checks.map((c) => (
          <Status key={c.name} {...c} />
        ))}
      </ul>
    </>
  );
}
