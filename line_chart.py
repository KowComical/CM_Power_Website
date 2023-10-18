import streamlit as st
import pandas as pd
import base64
import math
from streamlit_echarts import st_echarts, JsCode
import json
from datetime import datetime
import base64

st.set_page_config(layout="wide")

# 隐藏所有东西
hide_streamlit_style = """
                <style>
                div[data-testid="stToolbar"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stDecoration"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                div[data-testid="stStatusWidget"] {
                visibility: hidden;
                height: 0%;
                position: fixed;
                }
                #MainMenu {
                visibility: hidden;
                height: 0%;
                }
                header {
                visibility: hidden;
                height: 0%;
                }
                footer {
                visibility: hidden;
                height: 0%;
                }
                </style>
                """
st.markdown(hide_streamlit_style, unsafe_allow_html=True)

# Reading the dictionary from the text file
with open('./data/colors.txt', 'r') as file:
    COLORS = json.load(file)


# 主程序
def main():
    add_logo("./data/logo_edited.png")

    category_name = st.sidebar.selectbox(
        'Select Energy Type',
        ['total', 'coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other', 'fossil', 'renewables'],
        index=0  # 将默认值设置为'power'
    )

    df, df_7mean = data_read()

    # Get the sorted list of countries based on the selected category_name
    countries = get_countries_sorted_by_value(df_7mean, category_name)

    option, ROWS_PER_GRID, PLOT_HEIGHT = generate_grid_option(df_7mean, category_name, countries)

    st_echarts(options=option,
               height=f"{PLOT_HEIGHT * ROWS_PER_GRID * 1.2}px")


def add_logo(image_path):
    # Open the image file
    with open(image_path, "rb") as img_file:
        # Encode the image as Base64
        b64_string = base64.b64encode(img_file.read()).decode()

    # Insert the Base64 string into the CSS
    st.markdown(
        f"""
        <style>
            [data-testid="stSidebarNav"] {{
                background-image: url(data:image/png;base64,{b64_string});
                background-repeat: no-repeat;
                background-size: 80% auto;  /* Set width to 80% of the sidebar, height scales automatically */
                padding-top: 40px;  /* Adjust based on your image's height */
                background-position: 20px 20px;
            }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def get_countries_sorted_by_value(df, category_name):
    # Grouping by country and summing the values for the specific type
    type_sum = df[df['type'] == category_name].groupby('country')['value'].sum()

    # Sorting the values in descending order and getting the country names
    sorted_countries = type_sum.sort_values(ascending=False).index.tolist()

    return sorted_countries


# 生成 ECharts 配置的函数
def generate_grid_option(df_7mean, category_name, countries):
    num_countries = len(countries)

    # 定义全局设置
    # 动态计算行数和列数
    COLS = 4

    # 计算所需的行数以容纳所有国家，每行4列
    ROWS = int(math.ceil(num_countries / COLS))
    WIDTH = 100 / COLS
    HEIGHT = 92 / ROWS

    ROWS_PER_GRID = math.ceil(len(countries) / COLS)
    PLOT_HEIGHT = 200  # 根据需要进行调整

    # 调整间距
    WIDTH_ADJUSTMENT = 0.8  # 增加或减少以调整水平间距
    HEIGHT_ADJUSTMENT = 1.0  # 增加或减少以调整垂直间距

    # 格式化日期以用于 x 轴
    formatted_dates = df_7mean['date'].dt.strftime('%b-%d').drop_duplicates().tolist()

    option = {
        "title": [{
            "text": "Global Power Generation Trends by Source for Key Countries (TWh)",
            "left": "center",
            "top": "0%"
        }],
        "tooltip": {
            "trigger": "axis"
        },
        "xAxis": [],
        "yAxis": [],
        "grid": [],
        "series": []
    }

    # 创建存储每年颜色的字典
    unique_years_all = df_7mean['year'].unique()
    colors_for_years = dict(zip(unique_years_all, get_line_colors(unique_years_all)))

    # 创建图表的网格
    for idx, country in enumerate(countries):

        # 创建网格并进行间距调整
        option["grid"].append({
            "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT + 10}%",
            "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT}%",
            "width": f"{WIDTH - 2.0 * WIDTH_ADJUSTMENT}%",
            "height": f"{HEIGHT - 4.0 * HEIGHT_ADJUSTMENT}%",
            "containLabel": True
        })

        # 过滤当前国家的数据
        country_data = df_7mean[df_7mean['country'] == country]
        min_val = float(round(country_data[country_data['type'] == category_name]['value'].min() * 0.95))
        max_val = float(round(country_data[country_data['type'] == category_name]['value'].max() * 1.05))

        # 为网格创建 x 和 y 轴
        option["xAxis"].append({
            "gridIndex": idx,
            "type": "category",
            "data": formatted_dates,
        })

        option["yAxis"].append({
            "gridIndex": idx,
            "type": "value",
            "min": min_val,
            "max": max_val,
            "name": country,
            "nameTextStyle": {
                "fontSize": 14,  # 根据需要进行调整
                "fontWeight": "bold",
                "padding": [0, 0, 0, 100]  # 如果需要，添加一些填充。[上，右，下，左]
            }
        })

        # 为每年生成系列数据
        unique_years = country_data['year'].unique()
        for year in unique_years:
            year_data = country_data[country_data['year'] == year]
            option["series"].append({
                "name": str(year),
                "type": "line",
                "xAxisIndex": idx,
                "yAxisIndex": idx,
                "data": year_data[year_data['type'] == category_name]['value'].tolist(),
                "itemStyle": {
                    "color": colors_for_years[year],
                    "opacity": 0.2  # default opacity for all lines
                },
                "emphasis": {  # Add this block for emphasis styling
                    "lineStyle": {
                        "width": 4
                    },
                    "itemStyle": {
                        "opacity": 1
                    }
                },
                "selectedMode": "single",  # Add this line to allow single line selection
            })

    option["legend"] = {
        "data": [{"name": str(year), "icon": "circle", "textStyle": {"color": colors_for_years[year]}} for year in
                 unique_years_all],
        "left": 'center',
        "orient": "horizontal",
        "top": 50,
        "icon": "circle",  # This will give a filled circle symbol
        "itemWidth": 12,  # Controls the width of the circle
        "itemHeight": 12,  # Controls the height of the circle
        "borderColor": "#333",  # Border color, here it's a dark gray
        "borderWidth": 1,  # Width of the border
        "borderRadius": 4,  # Rounded corners, adjust for desired roundness
        "padding": 10,  # Padding around the legend items
        "backgroundColor": "#f4f4f4",  # Light gray background for the legend
        "textStyle": {
            "fontSize": 16,
            "color": "#333"  # Font color matching the border color
        }
    }

    return option, ROWS_PER_GRID, PLOT_HEIGHT


# 数据处理函数
def data_read():
    df = pd.read_csv('./data/data_for_download.csv')
    df_7mean = pd.read_csv('./data/data_for_line_chart.csv')

    df['date'] = pd.to_datetime(df['date'])
    df_7mean['date'] = pd.to_datetime(df_7mean['date'])

    return df, df_7mean


# 获取 CSV 下载链接的辅助函数
def get_csv_download_link(df, filename="data.csv"):
    csv = df.to_csv(index=False)
    b64 = base64.b64encode(csv.encode()).decode()
    href = f'<a href="data:file/csv;base64,{b64}" download="{filename}">下载 CSV 文件</a>'
    return href


def adjust_lightness(rgb, factor):
    """
    Adjusts the lightness of an RGB color.
    Positive factor values lighten the color, while negative values darken it.
    """
    r, g, b = rgb
    r = min(max(0, r + int(r * factor)), 255)
    g = min(max(0, g + int(g * factor)), 255)
    b = min(max(0, b + int(b * factor)), 255)
    return r, g, b


def clamp(value, min_value, max_value):
    """Ensure the value stays within the given range."""
    return max(min_value, min(value, max_value))


def get_line_colors(years_list):
    # Base colors
    blue_rgb = (76, 164, 224)  # Macaron Blue
    orange_rgb = (186, 97, 93)  # Macaron Orange
    black_color = 'rgb(0, 0, 0)'

    current_year = datetime.now().year  # Get the current year

    colors = []

    for year in years_list:
        if year in [2019, 2020]:
            factor = (2020 - year) * 0.3  # Darken by 10% for each year away from 2020
            # factor = clamp(factor, min_factor, max_factor)  # Ensure within range
            adjusted_blue = adjust_lightness(blue_rgb, -factor)
            colors.append(f'rgb{adjusted_blue}')
        elif year == current_year:  # Latest year
            colors.append(black_color)
        else:
            factor = (current_year - year) * 0.4  # Lighten by 20% for each year away from the current year

            adjusted_orange = adjust_lightness(orange_rgb, factor)
            colors.append(f'rgb{adjusted_orange}')

    return colors


if __name__ == '__main__':
    with st.spinner('Loading page...'):
        main()
