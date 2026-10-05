"""Mostra os endereços pelos quais OUTROS computadores da rede podem abrir o portal."""
import os
import socket


def enderecos():
    """Devolve (bons, automaticos). 'automaticos' são os 169.254.x.x, que o Windows inventa quando não recebe IP da rede."""
    ips = set()
    try:
        ips.update(i[4][0] for i in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET))
    except OSError:
        pass
    try:  # descobre o IP da placa que sai para a rede (não envia nada)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    ips.discard("127.0.0.1")
    return sorted(i for i in ips if not i.startswith("169.254.")), sorted(i for i in ips if i.startswith("169.254."))


def mostrar(porta):
    bons, auto = enderecos()
    if bons:
        print("Endereços para abrir em OUTROS computadores da rede:")
        for ip in bons:
            print(f"    http://{ip}:{porta}")
        print("(Se houver mais de um, use o da placa ligada à rede da empresa.)")
    else:
        print("ATENÇÃO: este computador não tem um endereço de rede válido, então outros computadores NÃO conseguem acessar.")
    if auto:
        print("Ignorados (endereço automático 169.254.x.x, não funciona para os outros): " + ", ".join(auto))
        if not bons:
            print("Isso acontece quando o cabo/Wi-Fi está desconectado ou a rede não entregou um IP (DHCP). Peça à TI um IP fixo.")


if __name__ == "__main__":
    mostrar(os.environ.get("PORTAL_PORT", "5000"))
