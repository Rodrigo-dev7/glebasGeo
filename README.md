# GlebasGEO - Validador Geoespacial

Sistema web de validação de glebas georreferenciadas com mapa interativo, construído com **React + Vite + Leaflet**.

---

## Instalação e Execução

```bash
# 1. Entre na pasta do projeto
cd glebas-validator

# 2. Instale as dependências
npm install

# 3. Inicie o servidor de desenvolvimento
npm run dev

# 4. Acesse em: http://localhost:5173
```

Para produção:

```bash
npm run build
npm run preview
```

---

## Estrutura do Projeto

```text
glebas-validator/
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── index.css
    ├── data/
    │   └── glebas.json
    ├── services/
    │   ├── validationService.js
    │   ├── excelGeoService.js
    │   ├── datasetImportService.js
    │   ├── coordinateValidationService.js
    │   ├── sicorGlebaValidationService.js
    │   └── reportService.js
    ├── hooks/
    │   └── useGlebas.js
    └── components/
        ├── MapView.jsx
        ├── Sidebar.jsx
        ├── GlebaPanel.jsx
        ├── CoordinateValidationPanel.jsx
        ├── FilterBar.jsx
        └── Legend.jsx
```

---

## Funcionalidades

### Mapa interativo

- Exibição de glebas em mapa Leaflet
- Polígonos coloridos por status
- Visualização do polígono mesmo quando houver erro
- Destaque de vértices corretos e com erro
- Popup com resumo da gleba e das coordenadas

### Validação de coordenadas

- Importação de arquivos `.xls`, `.xlsx`, `.geojson` e `.json`
- Validação por correspondência direta de ponto
- Validação por inclusão em área
- Destaque visual da gleba encontrada

### Regras SICOR implementadas

- `SICOR: A gleba informada nao corresponde a uma area valida.`
- `SICOR: Gleba deve ser polígono fechado: o primeiro e o último ponto devem ser iguais.`

### Ações da interface

- `Selecionar Arquivo`
- `Validar Gleba`
- `Exportar Relatório`
- `Limpar Dados`

---

## Observações

- O projeto mantém a estrutura original e adiciona serviços específicos para importação, validação SICOR e exportação de relatório.
- O parser de Excel é carregado sob demanda para reduzir o peso inicial da aplicação.

- Para preenchimento automatico de Munic�pio e UF por base local, substitua src/data/municipios-uf.json por uma base GeoJSON com limites administrativos e propriedades como municipio/
ome e uf/sigla_uf.
