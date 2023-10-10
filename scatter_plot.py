import pandas as pd
from streamlit_echarts import st_echarts
import seaborn as sns
import streamlit as st

st.set_page_config(layout="wide")


def main():
    df_compare = pd.read_csv('.data/data_for_scatter_plot.csv')
    create_echart(df_compare)


def create_echart(df_filtered):
    custom_order = ['total', 'coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other', 'fossil', 'renewables']
    df_filtered['type'] = pd.Categorical(df_filtered['type'], categories=custom_order, ordered=True)
    df_filtered = df_filtered.sort_values(by=['type'])

    type_grouped = df_filtered.groupby('type')

    subplots = []
    grid_layout = []
    xAxis = []
    yAxis = []

    # Get a palette of colors for countries
    unique_countries = df_filtered['country'].nunique()
    palette = sns.color_palette("husl", unique_countries).as_hex()
    country_to_color = dict(zip(df_filtered['country'].unique(), palette))

    sorted_countries = sorted(df_filtered['country'].unique())

    for idx, (name, group) in enumerate(type_grouped):

        country_grouped = group.groupby('country')

        min_val = 0
        max_val = max(group['value'].max(), group['iea'].max())

        country_grouped = sorted(country_grouped, key=lambda x: sorted_countries.index(x[0]))

        for country, country_group in country_grouped:
            scatter_data = []
            for _, row in country_group.iterrows():
                scatter_data.append({
                    'value': [row['value'], row['iea']],
                    'itemStyle': {
                        'color': country_to_color[country],
                        'opacity': 0.5 + 0.5 * (row['year'] + row['month'] / 12 - 2019) / 5
                    },
                    'name': f"{name.title()} - {country} {row['year']}-{row['month']:02d}\nCM_Power: {row['value']:.2f}\nIEA: {row['iea']:.2f}",
                    'seriesName': country  # Connect data points to their respective series
                })

            subplot = {
                "name": country,  # Use country as series name
                "type": "scatter",
                "xAxisIndex": idx,
                "yAxisIndex": idx,
                "data": scatter_data,
                "itemStyle": {
                    'color': country_to_color[country],  # Assign color at the series level
                }
            }
            subplots.append(subplot)

        # Define positions for each subplot
        col_idx = idx % 4
        row_idx = idx // 4
        grid = {
            "left": f"{col_idx * 25 + 3}%",
            "top": f"{row_idx * 25 + 10}%",
            "width": "20.5%",  # Updated width
            "height": "20.5%"  # Updated height
        }
        grid_layout.append(grid)

        xAxis.append({
            "gridIndex": idx,
            "min": min_val,
            "max": max_val
        })

        yAxis.append({
            "gridIndex": idx,
            "min": min_val,
            "max": max_val
        })

    option = {
        "title": [{
            "text": "CM_Power vs IEA by Energy Sector [Twh]",
            "left": "center",
            "top": "0%"
        }],
        "grid": grid_layout,
        "tooltip": {
            "trigger": 'item',
            "formatter": "{b}"  # updated tooltip format
        },
        "xAxis": xAxis,
        "yAxis": yAxis,
        "series": subplots,
        "legend": {
            "data": sorted_countries,  # List of unique countries
            "orient": "horizontal",
            "left": 'center',
            "top": 65,  # Increased top value to move the legend down
            "textStyle": {
                "fontSize": 16  # Adjust the legend font size as needed
            }
        },
    }

    # Adding titles for each subplot
    for idx, (name, _) in enumerate(type_grouped):
        col_idx = idx % 4
        row_idx = idx // 4
        subplot_title = {
            "text": name,
            "textAlign": 'center',
            "left": f"{col_idx * 25 + 3}% ",
            "top": f"{row_idx * 25 + 8}%",
            "textStyle": {
                "color": "#666",
                "fontSize": 15
            }
        }
        option["title"].append(subplot_title)

    rows = (len(type_grouped) + 3) // 4  # Calculate the number of rows

    st_echarts(options=option, height=f"{500 * rows}px")


if __name__ == "__main__":
    main()
